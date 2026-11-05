import { InvoicesService } from '../src/invoices/invoices.service';
import { InvoiceMrcMode } from '../src/invoices/dto/generate-invoice.dto';

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
      },
    };
    const service = new InvoicesService(prisma as never, {} as never, {} as never, {} as never);
    const preview = await service.preview({ customerId: '230155', startDate: '2026-11-01', endDate: '2026-11-15', mrcMode: InvoiceMrcMode.MANUAL, manualMrcAmount: 10, manualOtcItems: [{ description: 'Porting', amount: 3 }] });
    expect(preview.usageTotal).toBe(2);
    expect(preview.minimumShortfall).toBe(13);
    expect(preview.otcTotal).toBe(8);
    expect(preview.mrcAmount).toBe(10);
    expect(preview.totalAmount).toBe(33);
    expect(preview.items.find((item) => item.category === 'MIN_BILLING')?.totalAmount).toBe(13);
  });
});
