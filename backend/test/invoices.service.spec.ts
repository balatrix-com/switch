import { InvoicesService } from '../src/invoices/invoices.service';
import { InvoiceMrcMode, ManualMrcBasis } from '../src/invoices/dto/generate-invoice.dto';

describe('InvoicesService preview', () => {
  it('keeps posted usage separate from the prorated minimum shortfall and manual charges', async () => {
    const prisma = {
      customer: { findUnique: jest.fn().mockResolvedValue({ id: '230155', name: 'Example', accountCode: 'EX', currency: 'USD', settings: { monthlyMinimumSpend: 30 } }) },
      transaction: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1n, sourceType: 'cdr', direction: 'INBOUND', numberType: 'DID', billsec: 60, ratedSeconds: 60, freeMinutesUsed: 0, fiatDebitAmount: 2, balanceAfter: 8 },
          { id: 2n, sourceType: 'otc', fiatDebitAmount: 5, notes: 'Setup', balanceAfter: 3 },
        ]),
        findFirst: jest.fn().mockResolvedValue({ balanceAfter: 10 }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { didMinuteDelta: 0, freeMinutesUsed: 0 } }),
      },
      customerWallet: { findUnique: jest.fn().mockResolvedValue({ didFreeMinutes: 0 }) },
    };
    const service = new InvoicesService(prisma as never, { getCustomerSubscriptions: jest.fn().mockResolvedValue([]) } as never, {} as never, {} as never);
    const preview = await service.preview({ customerId: '230155', startDate: '2026-11-01', endDate: '2026-11-15', mrcMode: InvoiceMrcMode.MANUAL, manualMrcAmount: 10, manualOtcItems: [{ description: 'Porting', amount: 3 }] });
    expect(preview.usageTotal).toBe(2);
    expect(preview.minimumShortfall).toBe(13);
    expect(preview.otcTotal).toBe(8);
    expect(preview.mrcAmount).toBe(10);
    expect(preview.totalAmount).toBe(33);
    expect(preview.items.find((item) => item.category === 'MIN_BILLING')?.totalAmount).toBe(13);
  });
  it('skips MRC and OTC while preserving usage and shows shared DID minutes when a plan includes them', async () => {
    const prisma = {
      customer: { findUnique: jest.fn().mockResolvedValue({ id: '230155', name: 'Example', accountCode: 'EX', currency: 'USD', settings: {} }) },
      transaction: { findMany: jest.fn().mockResolvedValue([{ id: 1n, sourceType: 'cdr', direction: 'INBOUND', billsec: 60, ratedSeconds: 60, freeMinutesUsed: 1, fiatDebitAmount: 2, balanceAfter: 8 }, { id: 2n, sourceType: 'otc', fiatDebitAmount: 5, notes: 'Setup' }]), findFirst: jest.fn().mockResolvedValue(null), aggregate: jest.fn().mockResolvedValue({ _sum: { didMinuteDelta: 0, freeMinutesUsed: 0 } }) },
      customerWallet: { findUnique: jest.fn().mockResolvedValue({ didFreeMinutes: 9 }) },
    };
    const subscriptions = { getCustomerSubscriptions: jest.fn().mockResolvedValue([{ id: 'sub', plan_name: 'DID', recurring_cost: 10, subscribed_at: '2026-11-01', expires_at: '2026-12-01', status: 'active', plan_det: { did_minutes: 10 } }]) };
    const service = new InvoicesService(prisma as never, subscriptions as never, {} as never, {} as never);
    const preview = await service.preview({ customerId: '230155', startDate: '2026-11-01', endDate: '2026-11-15', mrcMode: InvoiceMrcMode.AUTO, skipMrc: true, skipOtc: true });
    expect(preview.mrcAmount).toBe(0);
    expect(preview.otcTotal).toBe(0);
    expect(preview.usageTotal).toBe(2);
    expect(preview.freeMinutesReport).toEqual({ included: 10, consumed: 1, remaining: 9, asOf: '2026-11-15' });
  });
  it('multiplies manual MRC by the numbers the customer currently holds', async () => {
    const prisma = {
      customer: { findUnique: jest.fn().mockResolvedValue({ id: '482692', name: 'Example', accountCode: 'EX', currency: 'USD', settings: {} }) },
      customerNumber: { count: jest.fn().mockResolvedValue(10) },
      transaction: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), aggregate: jest.fn().mockResolvedValue({ _sum: {} }) },
      customerWallet: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new InvoicesService(prisma as never, { getCustomerSubscriptions: jest.fn().mockResolvedValue([]) } as never, {} as never, {} as never);
    const manual = await service.preview({ customerId: '482692', startDate: '2026-11-01', endDate: '2026-11-30', mrcMode: InvoiceMrcMode.MANUAL, manualMrcAmount: 2, manualMrcBasis: ManualMrcBasis.PER_NUMBER });
    expect(manual.mrcAmount).toBe(20);
    expect(manual.items.find((item) => item.category === 'MRC_MANUAL')).toMatchObject({ quantity: 10, unitPrice: 2, totalAmount: 20, metadata: { billingBasis: 'PER_NUMBER', assignedNumberCount: 10 } });
    expect(prisma.customerNumber.count).toHaveBeenCalledWith({ where: { customerId: '482692' } });

    const flat = await service.preview({ customerId: '482692', startDate: '2026-11-01', endDate: '2026-11-30', mrcMode: InvoiceMrcMode.MANUAL, manualMrcAmount: 2, manualMrcBasis: ManualMrcBasis.FLAT });
    expect(flat.mrcAmount).toBe(2);
    expect(prisma.customerNumber.count).toHaveBeenCalledTimes(1);
  });
  it('adds per-number manual MRC to subscription MRC in hybrid mode', async () => {
    const prisma = {
      customer: { findUnique: jest.fn().mockResolvedValue({ id: '482692', name: 'Example', accountCode: 'EX', currency: 'USD', settings: {} }) },
      customerNumber: { count: jest.fn().mockResolvedValue(10) },
      transaction: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), aggregate: jest.fn().mockResolvedValue({ _sum: {} }) },
      customerWallet: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const subscriptions = { getCustomerSubscriptions: jest.fn().mockResolvedValue([{ id: 'sub', plan_name: 'Plan', recurring_cost: 5, subscribed_at: '2026-11-01T00:00:00Z', expires_at: '2026-12-01T00:00:00Z', status: 'active' }]) };
    const service = new InvoicesService(prisma as never, subscriptions as never, {} as never, {} as never);
    const preview = await service.preview({ customerId: '482692', startDate: '2026-11-01', endDate: '2026-11-30', mrcMode: InvoiceMrcMode.HYBRID, manualMrcAmount: 2, manualMrcBasis: ManualMrcBasis.PER_NUMBER });
    expect(preview.mrcAmount).toBe(25);
    expect(preview.items.find((item) => item.category === 'MRC_AUTO')?.totalAmount).toBe(5);
    expect(preview.items.find((item) => item.category === 'MRC_MANUAL')?.totalAmount).toBe(20);
  });
  it('supports a separate plan invoice with a signed price adjustment and no repeated usage', async () => {
    const prisma = {
      customer: { findUnique: jest.fn().mockResolvedValue({ id: '482692', name: 'Example', accountCode: 'EX', currency: 'USD', settings: { monthlyMinimumSpend: 30 } }) },
      transaction: { findMany: jest.fn().mockResolvedValue([{ id: 1n, sourceType: 'cdr', direction: 'INBOUND', billsec: 60, ratedSeconds: 60, freeMinutesUsed: 0, fiatDebitAmount: 2, balanceAfter: 8 }]), findFirst: jest.fn().mockResolvedValue(null), aggregate: jest.fn().mockResolvedValue({ _sum: {} }) },
      customerWallet: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new InvoicesService(prisma as never, { getCustomerSubscriptions: jest.fn().mockResolvedValue([]) } as never, {} as never, {} as never);
    const preview = await service.preview({ customerId: '482692', startDate: '2026-11-01', endDate: '2026-11-30', mrcMode: InvoiceMrcMode.MANUAL, manualMrcAmount: 20, manualMrcBasis: ManualMrcBasis.FLAT, skipUsage: true, includeCallRecordings: false, customAdjustments: [{ description: 'Agreed discount', amount: -5 }] });
    expect(preview.totalAmount).toBe(15);
    expect(preview.usageTotal).toBe(0);
    expect(preview.minimumShortfall).toBe(0);
    expect(preview.items.find((item) => item.category === 'ADJUSTMENT')?.totalAmount).toBe(-5);
    await expect(service.preview({ customerId: '482692', startDate: '2026-11-01', endDate: '2026-11-30', mrcMode: InvoiceMrcMode.MANUAL, manualMrcAmount: 20, manualMrcBasis: ManualMrcBasis.FLAT, skipUsage: true, customAdjustments: [{ description: 'Excessive discount', amount: -21 }] })).rejects.toThrow('below zero');
  });
});

describe('InvoicesService generate', () => {
  it('acquires the customer lock without returning PostgreSQL void to Prisma', async () => {
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([{ lockAcquired: 1 }])
      .mockResolvedValueOnce([{ value: 42n }]);
    const transaction = {
      $queryRaw: queryRaw,
      invoice: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ invoiceNumber: 'INV-202611-0042' }),
      },
    };
    const prisma = { $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)) };
    const service = new InvoicesService(prisma as never, {} as never, {} as never, {} as never);
    jest.spyOn(service, 'preview').mockResolvedValue({
      currency: 'USD', mrcAmount: 0, otcTotal: 0, usageTotal: 0,
      servicesTotal: 0, subtotal: 0, totalAmount: 0, items: [], wallet: {},
    } as never);

    await service.generate({ customerId: '482692', startDate: '2026-11-01', endDate: '2026-11-17', mrcMode: InvoiceMrcMode.AUTO });

    const lockSql = (queryRaw.mock.calls[0][0] as string[]).join('?');
    expect(lockSql).toContain('SELECT 1::int AS "lockAcquired"');
    expect(lockSql).toContain('FROM pg_advisory_xact_lock(hashtext(');
    expect(transaction.invoice.create).toHaveBeenCalledTimes(1);
    expect(transaction.invoice.findFirst).not.toHaveBeenCalled();
  });
  it('keeps the scheduled monthly run idempotent when an overlapping invoice exists', async () => {
    const transaction = { $queryRaw: jest.fn().mockResolvedValue([{ lockAcquired: 1 }]), invoice: { findFirst: jest.fn().mockResolvedValue({ invoiceNumber: 'INV-202611-0001' }), create: jest.fn() } };
    const prisma = { $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)) };
    const service = new InvoicesService(prisma as never, {} as never, {} as never, {} as never);
    jest.spyOn(service, 'preview').mockResolvedValue({ currency: 'USD', items: [], totalAmount: 0, wallet: {} } as never);
    await expect(service.generate({ customerId: '482692', startDate: '2026-11-01', endDate: '2026-11-30', mrcMode: InvoiceMrcMode.AUTO }, true)).rejects.toThrow('Date range already invoiced');
    expect(transaction.invoice.create).not.toHaveBeenCalled();
  });
});
