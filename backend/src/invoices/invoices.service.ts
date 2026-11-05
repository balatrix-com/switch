import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MrcType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionClientService } from '../subscription/subscription-client.service';
import { ZeptoMailService } from '../email/zeptomail.service';
import { GenerateInvoiceDto, InvoiceMrcMode } from './dto/generate-invoice.dto';

type Item = { category: string; description: string; quantity: number; unitPrice: number; totalAmount: number; metadata?: Prisma.InputJsonValue };
type Subscription = { id: string; plan_name: string; recurring_cost: string | number; subscribed_at: string; expires_at: string; status: string };
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const dateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);

@Injectable()
export class InvoicesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InvoicesService.name);
  private monthlyTimer?: ReturnType<typeof setInterval>;
  private monthlyRunning = false;
  constructor(private readonly prisma: PrismaService, private readonly subscriptions: SubscriptionClientService, private readonly mail: ZeptoMailService, private readonly config: ConfigService) {}

  onModuleInit() {
    if (this.config.get<string>('INVOICE_AUTO_MONTHLY_ENABLED', 'false') !== 'true') return;
    void this.generatePreviousMonth();
    this.monthlyTimer = setInterval(() => void this.generatePreviousMonth(), 60 * 60 * 1000);
    this.monthlyTimer.unref?.();
  }
  onModuleDestroy() { if (this.monthlyTimer) clearInterval(this.monthlyTimer); }
  private async generatePreviousMonth() {
    const now = new Date();
    if (now.getUTCDate() !== 1 || this.monthlyRunning) return;
    this.monthlyRunning = true;
    try {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
      const startDate = start.toISOString().slice(0, 10);
      const endDate = end.toISOString().slice(0, 10);
      const customers = await this.prisma.customer.findMany({ where: { isActive: true }, select: { id: true } });
      for (const customer of customers) {
        try {
          await this.generate({ customerId: customer.id, startDate, endDate, mrcMode: InvoiceMrcMode.AUTO, includeCallRecordings: true });
        } catch (error) {
          if (error instanceof ConflictException) continue;
          this.logger.error(`Monthly invoice failed for customer ${customer.id}: ${(error as Error).message}`);
        }
      }
    } catch (error) { this.logger.error(`Monthly invoicing failed: ${(error as Error).message}`); }
    finally { this.monthlyRunning = false; }
  }

  async preview(dto: GenerateInvoiceDto) {
    if (!dateOnly(dto.startDate) || !dateOnly(dto.endDate)) throw new BadRequestException('Use YYYY-MM-DD dates');
    const start = new Date(`${dto.startDate}T00:00:00Z`);
    const end = new Date(`${dto.endDate}T00:00:00Z`);
    if (end < start) throw new BadRequestException('End date must be on or after start date');
    const endExclusive = new Date(end.getTime() + 86400000);
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId }, include: { settings: true } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (dto.mrcMode !== InvoiceMrcMode.AUTO && dto.manualMrcAmount === undefined) throw new BadRequestException('Enter the manual MRC amount');
    if (dto.manualOtcItems?.some((item) => !item.description.trim())) throw new BadRequestException('Every manual OTC needs a description');

    const transactions = await this.prisma.transaction.findMany({
      where: { customerId: customer.id, createdAt: { gte: start, lt: endExclusive }, status: 'posted' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const items: Item[] = [];
    if (dto.mrcMode !== InvoiceMrcMode.AUTO) {
      const amount = cents(dto.manualMrcAmount || 0);
      items.push({ category: 'MRC_MANUAL', description: dto.manualMrcDescription?.trim() || 'Monthly recurring charge (manual)', quantity: 1, unitPrice: amount, totalAmount: amount });
    }
    if (dto.mrcMode !== InvoiceMrcMode.MANUAL) {
      const result = await this.subscriptions.getCustomerSubscriptions(customer.id) as { data?: Subscription[] } | Subscription[];
      const subscriptions = Array.isArray(result) ? result : result.data;
      if (!Array.isArray(subscriptions)) throw new BadRequestException('Subscription service returned no usable subscription list');
      for (const subscription of subscriptions) {
        if (subscription.status === 'cancelled' || subscription.status === 'suspended') continue;
        const activeFrom = new Date(subscription.subscribed_at);
        const activeTo = new Date(subscription.expires_at);
        const overlap = Math.max(0, Math.min(activeTo.getTime(), endExclusive.getTime()) - Math.max(activeFrom.getTime(), start.getTime()));
        const cycle = activeTo.getTime() - activeFrom.getTime();
        if (!overlap || cycle <= 0) continue;
        const amount = cents(Number(subscription.recurring_cost || 0) * overlap / cycle);
        if (amount > 0) items.push({ category: 'MRC_AUTO', description: `Plan: ${subscription.plan_name}`, quantity: 1, unitPrice: amount, totalAmount: amount, metadata: { subscriptionId: subscription.id, overlapDays: overlap / 86400000, cycleDays: cycle / 86400000 } });
      }
    }
    for (const tx of transactions.filter((item) => item.sourceType === 'otc')) {
      const amount = cents(Number(tx.fiatDebitAmount));
      if (amount > 0) items.push({ category: 'OTC_AUTO', description: tx.notes || 'Plan activation fee', quantity: 1, unitPrice: amount, totalAmount: amount, metadata: { transactionId: String(tx.id) } });
    }
    for (const otc of dto.manualOtcItems || []) {
      const amount = cents(otc.amount);
      items.push({ category: 'OTC_MANUAL', description: otc.description.trim(), quantity: 1, unitPrice: amount, totalAmount: amount });
    }
    for (const kind of ['TFN', 'DID', 'OB']) {
      const calls = transactions.filter((tx) => tx.sourceType === 'cdr' && (tx.direction === 'OUTBOUND' ? 'OB' : (tx.numberType || 'DID').toUpperCase()) === kind);
      if (!calls.length) continue;
      const amount = cents(calls.reduce((sum, tx) => sum + Number(tx.fiatDebitAmount), 0));
      items.push({ category: `USAGE_${kind}`, description: `${kind} call usage`, quantity: calls.length, unitPrice: 0, totalAmount: amount, metadata: { callCount: calls.length, durationSeconds: calls.reduce((sum, tx) => sum + tx.billsec, 0), freeMinutesUsed: calls.reduce((sum, tx) => sum + tx.freeMinutesUsed, 0), billableSeconds: calls.reduce((sum, tx) => sum + tx.ratedSeconds, 0) } });
    }
    const usageCharges = cents(items.filter((item) => item.category.startsWith('USAGE_')).reduce((total, item) => total + item.totalAmount, 0));
    const monthlyMinimum = Number(customer.settings?.monthlyMinimumSpend || 0);
    if (monthlyMinimum > 0) {
      let commitment = 0;
      for (let day = new Date(start); day < endExclusive; day.setUTCDate(day.getUTCDate() + 1)) {
        const daysInMonth = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
        commitment += monthlyMinimum / daysInMonth;
      }
      const shortfall = cents(Math.max(0, cents(commitment) - usageCharges));
      if (shortfall > 0) items.push({ category: 'MIN_BILLING', description: 'Minimum usage commitment shortfall', quantity: 1, unitPrice: shortfall, totalAmount: shortfall, metadata: { proratedCommitment: cents(commitment), usageCharges } });
    }
    if (dto.includeCallRecordings !== false) {
      const recording = transactions.filter((tx) => tx.sourceType === 'recording');
      if (recording.length) {
        const amount = cents(recording.reduce((sum, tx) => sum + Number(tx.fiatDebitAmount), 0));
        items.push({ category: 'RECORDING', description: 'Call recording charges', quantity: recording.length, unitPrice: 0, totalAmount: amount });
      }
    }
    const sum = (categories: string[]) => cents(items.filter((item) => categories.includes(item.category)).reduce((total, item) => total + item.totalAmount, 0));
    const mrcAmount = sum(['MRC_AUTO', 'MRC_MANUAL']);
    const otcTotal = sum(['OTC_AUTO', 'OTC_MANUAL']);
    const usageTotal = sum(['USAGE_TFN', 'USAGE_DID', 'USAGE_OB']);
    const minimumShortfall = sum(['MIN_BILLING']);
    const servicesTotal = sum(['RECORDING']);
    const subtotal = cents(mrcAmount + otcTotal + usageTotal + servicesTotal + minimumShortfall);
    const before = await this.prisma.transaction.findFirst({ where: { customerId: customer.id, createdAt: { lt: start }, balanceAfter: { not: null } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    const last = [...transactions].reverse().find((tx) => tx.balanceAfter !== null);
    const topUps = cents(transactions.filter((tx) => tx.sourceType === 'topup').reduce((total, tx) => total + Math.abs(Number(tx.fiatDebitAmount)), 0));
    return { customer: { id: customer.id, name: customer.name, accountCode: customer.accountCode }, startDate: dto.startDate, endDate: dto.endDate, currency: customer.currency, mrcType: dto.mrcMode, items, mrcAmount, otcTotal, usageTotal, servicesTotal, minimumShortfall, subtotal, taxAmount: 0, totalAmount: subtotal, wallet: { openingBalance: before?.balanceAfter === null || !before ? null : Number(before.balanceAfter), topUps, closingBalance: last?.balanceAfter === null || !last ? null : Number(last.balanceAfter) }, notes: dto.notes || null, minimumSpendNote: monthlyMinimum > 0 ? `Monthly minimum usage spend: ${monthlyMinimum} ${customer.currency}; prorated to the selected period.` : 'No monthly minimum usage spend configured.' };
  }

  async generate(dto: GenerateInvoiceDto) {
    const preview = await this.preview(dto);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.customerId}))`;
      const overlap = await tx.invoice.findFirst({ where: { customerId: dto.customerId, status: { not: 'CANCELLED' }, startDate: { lte: new Date(`${dto.endDate}T00:00:00Z`) }, endDate: { gte: new Date(`${dto.startDate}T00:00:00Z`) } } });
      if (overlap) throw new ConflictException(`Date range overlaps invoice ${overlap.invoiceNumber}`);
      const sequence = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('invoice_number_sequence') AS value`;
      const invoiceNumber = `INV-${dto.startDate.slice(0, 7).replace('-', '')}-${String(sequence[0].value).padStart(4, '0')}`;
      return tx.invoice.create({ data: {
        invoiceNumber, customerId: dto.customerId, startDate: new Date(`${dto.startDate}T00:00:00Z`), endDate: new Date(`${dto.endDate}T00:00:00Z`), currency: preview.currency,
        mrcType: dto.mrcMode as MrcType, mrcAmount: preview.mrcAmount, otcTotal: preview.otcTotal, usageTotal: preview.usageTotal, servicesTotal: preview.servicesTotal, subtotal: preview.subtotal, totalAmount: preview.totalAmount, notes: dto.notes, walletSnapshot: preview.wallet,
        items: { create: preview.items.map((item) => ({ ...item, metadata: item.metadata ?? Prisma.JsonNull })) },
      }, include: { items: true, customer: { select: { id: true, name: true, accountCode: true } } } });
    });
  }

  list(customerId?: string, page = 1, pageSize = 25, startDate?: string, endDate?: string) {
    if (startDate && !dateOnly(startDate)) throw new BadRequestException('Invalid startDate');
    if (endDate && !dateOnly(endDate)) throw new BadRequestException('Invalid endDate');
    const where: Prisma.InvoiceWhereInput = {
      ...(customerId ? { customerId } : {}),
      ...(startDate ? { endDate: { gte: new Date(`${startDate}T00:00:00Z`) } } : {}),
      ...(endDate ? { startDate: { lte: new Date(`${endDate}T00:00:00Z`) } } : {}),
    };
    return this.prisma.invoice.findMany({ where, include: { customer: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, skip: (Math.max(1, page) - 1) * Math.min(100, Math.max(1, pageSize)), take: Math.min(100, Math.max(1, pageSize)) });
  }
  async get(id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: { items: true, customer: { select: { id: true, name: true, accountCode: true } } } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }
  async html(id: string) {
    const invoice = await this.get(id);
    const rows = invoice.items.map((item) => `<tr><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.totalAmount)}</td></tr>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(invoice.invoiceNumber)}</title><style>body{font:16px Arial,sans-serif;max-width:850px;margin:48px auto;color:#172033}table{width:100%;border-collapse:collapse;margin:28px 0}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print / Save PDF</button><h1>Invoice ${escapeHtml(invoice.invoiceNumber)}</h1><p>${escapeHtml(invoice.customer.name)} · ${escapeHtml(invoice.startDate.toISOString().slice(0,10))} to ${escapeHtml(invoice.endDate.toISOString().slice(0,10))}</p><table><thead><tr><th>Category</th><th>Description</th><th>${escapeHtml(invoice.currency)}</th></tr></thead><tbody>${rows}</tbody></table><h2>Total: ${escapeHtml(invoice.currency)} ${escapeHtml(invoice.totalAmount)}</h2></body></html>`;
  }
  async cdrCsv(id: string) {
    const invoice = await this.get(id);
    const start = new Date(invoice.startDate);
    const endExclusive = new Date(invoice.endDate.getTime() + 86400000);
    const calls = await this.prisma.transaction.findMany({ where: { customerId: invoice.customerId, sourceType: 'cdr', status: 'posted', createdAt: { gte: start, lt: endExclusive } }, orderBy: { createdAt: 'asc' } });
    const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    return ['date,reference,direction,number_type,billsec,rated_seconds,free_minutes_used,amount,currency', ...calls.map((tx) => [tx.createdAt.toISOString(), tx.sourceRef, tx.direction, tx.numberType, tx.billsec, tx.ratedSeconds, tx.freeMinutesUsed, tx.fiatDebitAmount, tx.currency].map(quote).join(','))].join('\n');
  }
  async sendEmail(id: string) {
    const invoice = await this.get(id);
    const admin = await this.prisma.user.findFirst({ where: { customerId: invoice.customerId, role: 'CUSTOMER', status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
    if (!admin) throw new BadRequestException('Customer administrator email not found');
    const result = await this.mail.sendInvoice(admin.email, invoice.invoiceNumber, String(invoice.totalAmount), invoice.currency, await this.html(id));
    if (result.status !== 'SENT') throw new BadRequestException(`Invoice email was ${result.status.toLowerCase()}; check ZeptoMail configuration`);
    return { status: result.status, recipient: admin.email };
  }
}
