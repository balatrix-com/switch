import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MrcType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionClientService } from '../subscription/subscription-client.service';
import { ZeptoMailService } from '../email/zeptomail.service';
import { GenerateInvoiceDto, InvoiceMrcMode, ManualMrcBasis } from './dto/generate-invoice.dto';

type Item = { category: string; description: string; quantity: number; unitPrice: number; totalAmount: number; metadata?: Prisma.InputJsonValue };
type Subscription = { id: string; plan_name: string; recurring_cost: string | number; subscribed_at: string; expires_at: string; status: string; plan_type?: string; plan_det?: { did_minutes?: number; free_minutes?: number } };
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const dateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
const invoiceMoney = (value: unknown, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value ?? 0));
const balatrixLogoPath = [join(__dirname, '../../../assets/balatrix-logo.svg'), join(__dirname, '../../assets/balatrix-logo.svg'), join(process.cwd(), 'assets/balatrix-logo.svg')].find(existsSync);
const balatrixLogo = balatrixLogoPath ? readFileSync(balatrixLogoPath).toString('base64') : null;

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
          await this.generate({ customerId: customer.id, startDate, endDate, mrcMode: InvoiceMrcMode.AUTO, includeCallRecordings: true }, true);
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
    if (!dto.skipMrc && dto.mrcMode !== InvoiceMrcMode.AUTO && dto.manualMrcAmount === undefined) throw new BadRequestException('Enter the manual MRC amount');
    if (dto.manualOtcItems?.some((item) => !item.description.trim())) throw new BadRequestException('Every manual OTC needs a description');
    if (dto.customAdjustments?.some((item) => !item.description.trim() || item.amount === 0)) throw new BadRequestException('Every adjustment needs a description and a non-zero amount');

    const transactions = await this.prisma.transaction.findMany({
      where: { customerId: customer.id, createdAt: { gte: start, lt: endExclusive }, status: 'posted' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const items: Item[] = [];
    if (!dto.skipMrc && dto.mrcMode !== InvoiceMrcMode.AUTO) {
      const unitPrice = cents(dto.manualMrcAmount || 0);
      // Omitted basis preserves existing API clients' flat manual charge.
      // The invoice UI explicitly opts in to per-assigned-number pricing.
      const perNumber = dto.manualMrcBasis === ManualMrcBasis.PER_NUMBER;
      const quantity = perNumber
        ? await this.prisma.customerNumber.count({ where: { customerId: customer.id } })
        : 1;
      const amount = cents(unitPrice * quantity);
      items.push({
        category: 'MRC_MANUAL',
        description: dto.manualMrcDescription?.trim() || 'Monthly recurring charge (manual)',
        quantity,
        unitPrice,
        totalAmount: amount,
        metadata: perNumber
          ? { billingBasis: ManualMrcBasis.PER_NUMBER, assignedNumberCount: quantity }
          : { billingBasis: ManualMrcBasis.FLAT },
      });
    }
    let subscriptions: Subscription[] = [];
    const result = await this.subscriptions.getCustomerSubscriptions(customer.id) as { data?: Subscription[] } | Subscription[];
    subscriptions = Array.isArray(result) ? result : result.data || [];
    if (!Array.isArray(subscriptions)) throw new BadRequestException('Subscription service returned no usable subscription list');
    if (!dto.skipMrc && dto.mrcMode !== InvoiceMrcMode.MANUAL) {
      for (const tx of transactions.filter((item) => item.sourceType === 'mrc')) {
        const amount = cents(Number(tx.fiatDebitAmount));
        if (amount > 0) items.push({ category: 'MRC_WALLET', description: tx.notes || 'Manual recurring charge', quantity: 1, unitPrice: amount, totalAmount: amount, metadata: { transactionId: String(tx.id) } });
      }
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
    for (const tx of dto.skipOtc ? [] : transactions.filter((item) => item.sourceType === 'otc')) {
      const amount = cents(Number(tx.fiatDebitAmount));
      if (amount > 0) items.push({ category: 'OTC_AUTO', description: tx.notes || 'Plan activation fee', quantity: 1, unitPrice: amount, totalAmount: amount, metadata: { transactionId: String(tx.id) } });
    }
    for (const otc of dto.skipOtc ? [] : dto.manualOtcItems || []) {
      const amount = cents(otc.amount);
      items.push({ category: 'OTC_MANUAL', description: otc.description.trim(), quantity: 1, unitPrice: amount, totalAmount: amount });
    }
    for (const kind of dto.skipUsage ? [] : ['DID', 'OB']) {
      const calls = transactions.filter((tx) => tx.sourceType === 'cdr' && (tx.direction === 'OUTBOUND' ? 'OB' : 'DID') === kind);
      if (!calls.length) continue;
      const amount = cents(calls.reduce((sum, tx) => sum + Number(tx.fiatDebitAmount), 0));
      items.push({ category: `USAGE_${kind}`, description: `${kind} call usage`, quantity: calls.length, unitPrice: 0, totalAmount: amount, metadata: { callCount: calls.length, durationSeconds: calls.reduce((sum, tx) => sum + tx.billsec, 0), freeMinutesUsed: calls.reduce((sum, tx) => sum + tx.freeMinutesUsed, 0), billableSeconds: calls.reduce((sum, tx) => sum + tx.ratedSeconds, 0) } });
    }
    const usageCharges = cents(items.filter((item) => item.category.startsWith('USAGE_')).reduce((total, item) => total + item.totalAmount, 0));
    const monthlyMinimum = Number(customer.settings?.monthlyMinimumSpend || 0);
    if (!dto.skipUsage && monthlyMinimum > 0) {
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
    for (const adjustment of dto.customAdjustments || []) {
      const amount = cents(adjustment.amount);
      items.push({ category: 'ADJUSTMENT', description: adjustment.description.trim(), quantity: 1, unitPrice: amount, totalAmount: amount });
    }
    const sum = (categories: string[]) => cents(items.filter((item) => categories.includes(item.category)).reduce((total, item) => total + item.totalAmount, 0));
    const mrcAmount = sum(['MRC_AUTO', 'MRC_MANUAL', 'MRC_WALLET']);
    const otcTotal = sum(['OTC_AUTO', 'OTC_MANUAL']);
    const usageTotal = sum(['USAGE_DID', 'USAGE_OB']);
    const minimumShortfall = sum(['MIN_BILLING']);
    const servicesTotal = sum(['RECORDING']);
    const adjustmentTotal = sum(['ADJUSTMENT']);
    const subtotal = cents(mrcAmount + otcTotal + usageTotal + servicesTotal + minimumShortfall + adjustmentTotal);
    if (subtotal < 0) throw new BadRequestException('Adjustments cannot reduce the invoice total below zero');
    const before = await this.prisma.transaction.findFirst({ where: { customerId: customer.id, createdAt: { lt: start }, balanceAfter: { not: null } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    const last = [...transactions].reverse().find((tx) => tx.balanceAfter !== null);
    const topUps = cents(transactions.filter((tx) => tx.sourceType === 'topup').reduce((total, tx) => total + Math.abs(Number(tx.fiatDebitAmount)), 0));
    const included = subscriptions.filter((sub) => sub.status !== 'cancelled' && sub.status !== 'suspended' && new Date(sub.subscribed_at) < endExclusive && new Date(sub.expires_at) >= start).reduce((sum, sub) => sum + Number(sub.plan_det?.did_minutes || 0) + (sub.plan_type === 'DID' ? Number(sub.plan_det?.free_minutes || 0) : 0), 0);
    const consumed = transactions.filter((tx) => tx.sourceType === 'cdr' && tx.direction !== 'OUTBOUND').reduce((sum, tx) => sum + tx.freeMinutesUsed, 0);
    const walletNow = await this.prisma.customerWallet.findUnique({ where: { customerId: customer.id } });
    const laterMinuteChanges = await this.prisma.transaction.aggregate({ where: { customerId: customer.id, createdAt: { gte: endExclusive }, status: 'posted' }, _sum: { didMinuteDelta: true } });
    const laterLegacyUsage = await this.prisma.transaction.aggregate({ where: { customerId: customer.id, createdAt: { gte: endExclusive }, status: 'posted', sourceType: 'cdr', didMinuteDelta: 0, direction: 'INBOUND' }, _sum: { freeMinutesUsed: true } });
    const remaining = walletNow ? Math.max(0, walletNow.didFreeMinutes - (laterMinuteChanges._sum.didMinuteDelta || 0) + (laterLegacyUsage._sum.freeMinutesUsed || 0)) : Math.max(0, included - consumed);
    const freeMinutesReport = included > 0 ? { included, consumed, remaining, asOf: dto.endDate } : null;
    return { customer: { id: customer.id, name: customer.name, accountCode: customer.accountCode }, startDate: dto.startDate, endDate: dto.endDate, currency: customer.currency, mrcType: dto.mrcMode, items, mrcAmount, otcTotal, usageTotal, servicesTotal, adjustmentTotal, minimumShortfall, subtotal, taxAmount: 0, totalAmount: subtotal, wallet: { openingBalance: before?.balanceAfter === null || !before ? null : Number(before.balanceAfter), topUps, closingBalance: last?.balanceAfter === null || !last ? null : Number(last.balanceAfter), freeMinutesReport }, freeMinutesReport, notes: dto.notes || null, minimumSpendNote: dto.skipUsage ? 'Call usage and minimum usage charge skipped for this invoice.' : monthlyMinimum > 0 ? `Monthly minimum usage spend: ${monthlyMinimum} ${customer.currency}; prorated to the selected period.` : 'No monthly minimum usage spend configured.' };
  }

  async generate(dto: GenerateInvoiceDto, scheduled = false) {
    const preview = await this.preview(dto);
    return this.prisma.$transaction(async (tx) => {
      // PostgreSQL returns void from this function; selecting that value makes
      // Prisma fail to deserialize it. Select a supported scalar instead.
      await tx.$queryRaw<Array<{ lockAcquired: number }>>`
        SELECT 1::int AS "lockAcquired"
        FROM pg_advisory_xact_lock(hashtext(${dto.customerId}))
      `;
      // Manual invoices may share a period. The scheduled monthly job must
      // remain idempotent across its hourly checks and multiple app instances.
      if (scheduled) {
        const overlap = await tx.invoice.findFirst({ where: { customerId: dto.customerId, startDate: { lte: new Date(`${dto.endDate}T00:00:00Z`) }, endDate: { gte: new Date(`${dto.startDate}T00:00:00Z`) } } });
        if (overlap) throw new ConflictException(`Date range already invoiced by ${overlap.invoiceNumber}`);
      }
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
  async remove(id: string) {
    // The invoice_items FK cascades; usage and wallet transactions are not touched.
    const result = await this.prisma.invoice.deleteMany({ where: { id, status: 'PENDING', amountPaid: 0 } });
    if (result.count === 1) return { id, deleted: true };
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, select: { status: true, amountPaid: true } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    throw new ConflictException('Only unpaid pending invoices can be permanently deleted');
  }
  async html(id: string) {
    const invoice = await this.get(id);
    const rows = invoice.items.map((item) => {
      const metadata = item.metadata as { billingBasis?: string; assignedNumberCount?: number } | null;
      const numberDetails = item.category === 'MRC_MANUAL' && metadata?.billingBasis === ManualMrcBasis.PER_NUMBER
        ? `<small>${escapeHtml(metadata.assignedNumberCount)} assigned numbers × ${escapeHtml(invoiceMoney(item.unitPrice, invoice.currency))} each</small>`
        : '';
      const label = item.category === 'MRC_AUTO' ? 'Subscription plan' : item.category.startsWith('MRC') ? 'Recurring charge' : item.category.startsWith('OTC') ? 'One-time charge' : item.category === 'ADJUSTMENT' ? 'Custom adjustment' : 'Usage';
      return `<tr><td><strong>${escapeHtml(item.description)}</strong>${numberDetails}<span class="item-kind">${label}</span></td><td class="amount">${escapeHtml(invoiceMoney(item.totalAmount, invoice.currency))}</td></tr>`;
    }).join('');
    const report = (invoice.walletSnapshot as { freeMinutesReport?: { included: number; consumed: number; remaining: number } } | null)?.freeMinutesReport;
    const minutesHtml = report ? `<section class="minutes"><h2>Included DID minutes</h2><div class="minutes-grid"><div><span>Included</span><strong>${escapeHtml(report.included)}</strong></div><div><span>Used</span><strong>${escapeHtml(report.consumed)}</strong></div><div><span>Remaining</span><strong>${escapeHtml(report.remaining)}</strong></div></div></section>` : '';
    const period = `${invoice.startDate.toISOString().slice(0, 10)} – ${invoice.endDate.toISOString().slice(0, 10)}`;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Balatrix invoice ${escapeHtml(invoice.invoiceNumber)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#eef2f8;color:#17243d;font:14px/1.55 Arial,Helvetica,sans-serif}.toolbar{max-width:820px;margin:24px auto 12px;text-align:right}.toolbar button{background:#032b93;border:0;border-radius:8px;color:white;font:600 14px Arial;padding:11px 17px;cursor:pointer}.sheet{max-width:820px;min-height:980px;margin:0 auto 32px;padding:56px 60px;background:#fff;box-shadow:0 12px 40px #19335d1c}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:3px solid #032b93;padding-bottom:32px}.brand{display:flex;align-items:center;gap:8px}.brand img{display:block;width:210px;height:60px;object-fit:cover}.eyebrow{color:#63718b;text-transform:uppercase;letter-spacing:.14em;font-size:11px;font-weight:700}.title{text-align:right}.title h1{font-size:32px;line-height:1.1;margin:5px 0 7px;color:#132a61}.title p{margin:0;color:#63718b}.meta{display:grid;grid-template-columns:1.2fr 1fr;gap:30px;margin:34px 0 46px}.meta h2{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#63718b;margin:0 0 10px}.meta strong{font-size:17px;color:#17243d}.meta p{margin:4px 0}.meta dl{display:grid;grid-template-columns:110px 1fr;gap:7px 12px;margin:0}.meta dt{color:#63718b}.meta dd{margin:0;text-align:right;font-weight:600}table{width:100%;border-collapse:collapse}thead{background:#f3f6fc}th{font-size:11px;text-transform:uppercase;letter-spacing:.11em;color:#63718b;text-align:left;padding:13px 16px}td{border-bottom:1px solid #e5eaf2;padding:17px 16px;vertical-align:top}td strong{display:block;font-size:15px}td small,td .item-kind{display:block;color:#63718b;font-size:12px;margin-top:4px}.amount{text-align:right;white-space:nowrap;font-weight:700}th:last-child{text-align:right}.total{display:flex;justify-content:space-between;align-items:center;margin:26px 0 0 auto;padding:18px 20px;max-width:340px;border-radius:10px;background:#eef3ff;color:#132a61}.total span{font-weight:700}.total strong{font-size:23px}.minutes{margin-top:54px;border-top:1px solid #e5eaf2;padding-top:18px}.minutes h2{font-size:14px;margin:0 0 12px}.minutes-grid{display:flex;gap:28px}.minutes-grid div{display:grid;gap:2px}.minutes-grid span{color:#63718b;font-size:12px}.minutes-grid strong{font-size:16px}.foot{margin-top:65px;border-top:1px solid #e5eaf2;padding-top:15px;color:#63718b;font-size:12px}@media(max-width:600px){.sheet{padding:28px 22px;min-height:0}.top{flex-direction:column}.title{text-align:left}.meta{grid-template-columns:1fr}.minutes-grid{flex-wrap:wrap}}@media print{@page{size:A4;margin:12mm}body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.toolbar{display:none}.sheet{max-width:none;min-height:0;margin:0;padding:22px 24px;box-shadow:none}.foot{break-inside:avoid}}
    </style></head><body><div class="toolbar"><button type="button" onclick="window.print()">Print / Save PDF</button></div><main class="sheet"><header class="top"><div class="brand">${balatrixLogo ? `<img src="data:image/svg+xml;base64,${balatrixLogo}" alt="Balatrix logo">` : '<strong>Balatrix</strong>'}</div><div class="title"><span class="eyebrow">Billing document</span><h1>Invoice</h1><p>${escapeHtml(invoice.invoiceNumber)}</p></div></header><section class="meta"><div><h2>Bill to</h2><strong>${escapeHtml(invoice.customer.name)}</strong>${invoice.customer.accountCode ? `<p>Account ${escapeHtml(invoice.customer.accountCode)}</p>` : ''}</div><div><h2>Invoice details</h2><dl><dt>Billing period</dt><dd>${escapeHtml(period)}</dd><dt>Status</dt><dd>${escapeHtml(invoice.status)}</dd><dt>Currency</dt><dd>${escapeHtml(invoice.currency)}</dd></dl></div></section><table><thead><tr><th>Plan / description</th><th>Price</th></tr></thead><tbody>${rows || '<tr><td>No chargeable items</td><td class="amount">—</td></tr>'}</tbody></table><div class="total"><span>Total</span><strong>${escapeHtml(invoiceMoney(invoice.totalAmount, invoice.currency))}</strong></div>${minutesHtml}<footer class="foot">Issued by Balatrix · Invoice ${escapeHtml(invoice.invoiceNumber)}</footer></main></body></html>`;
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
    if (invoice.status === 'CANCELLED') throw new ConflictException('Cancelled invoices cannot be emailed');
    const admin = await this.prisma.user.findFirst({ where: { customerId: invoice.customerId, role: 'CUSTOMER', status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
    if (!admin) throw new BadRequestException('Customer administrator email not found');
    const result = await this.mail.sendInvoice(admin.email, invoice.invoiceNumber, String(invoice.totalAmount), invoice.currency, await this.html(id));
    if (result.status !== 'SENT') throw new BadRequestException(`Invoice email was ${result.status.toLowerCase()}; check ZeptoMail configuration`);
    return { status: result.status, recipient: admin.email };
  }
}
