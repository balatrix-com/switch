import { WalletService } from '../src/wallet/wallet.service';

describe('Wallet daily activity', () => {
  it('returns daily summaries and ordinary transactions without expanding call rows', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValueOnce([
        {
          kind: 'usage', id: 'usage:2026-11-17:USD',
          occurredAt: new Date('2026-11-18T00:00:00.000Z'),
          payload: {
            usageDate: '2026-11-17', currency: 'USD', callCount: 10000,
            recordingBatches: 100, freeMinutesUsed: 300,
            callCharge: '42.000000', recordingCharge: '5.000000',
          },
        },
      ]).mockResolvedValueOnce([{ count: 2 }]),
      walletDailyUsage: { count: jest.fn().mockResolvedValue(1) },
    };
    const service = new WalletService(prisma as never);
    const result = await service.getActivity('482692', 1, 25);
    expect(result.data).toEqual([
      expect.objectContaining({ kind: 'usage', callCount: 10000, callCharge: '42.000000' }),
    ]);
    expect(result.pagination).toEqual({ page: 1, pageSize: 25, total: 3, pages: 1 });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
