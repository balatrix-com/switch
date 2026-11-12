import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AnalyticsController } from '../src/analytics/analytics.controller';
import { AnalyticsService } from '../src/analytics/analytics.service';

describe('Call analytics', () => {
  it('calculates ASR and ACD from finalized CDR aggregates and binds tenant queries', async () => {
    const aggregate = { total: 4n, answered: 2n, unanswered: 1n, busy: 1n, failed: 0n, billsec: 120n, revenue: 1.5, carrierCost: 0.5, foreignCostCalls: 0n };
    const prisma = { $queryRaw: jest.fn()
      .mockResolvedValueOnce([aggregate])
      .mockResolvedValueOnce([{ day: '2026-11-12', total: 4n, answered: 2n }])
      .mockResolvedValueOnce([{ key: '8135886277', name: '8135886277', ...aggregate }])
      .mockResolvedValueOnce([{ currency: 'USD', revenue: 1.5, carrierCost: 0.5, foreignCostCalls: 0n }]) };
    const service = new AnalyticsService(prisma as never);
    const result = await service.get({ from: '2026-11-12T00:00:00.000Z', to: '2026-11-13T00:00:00.000Z' }, '230155', false);
    expect(result.summary).toMatchObject({ total: 4, answered: 2, unanswered: 1, busy: 1, asr: 50, acdSeconds: 60, minutes: 2 });
    expect(result.dids[0].key).toBe('8135886277');
    expect(result.tenants).toEqual([]);
    expect(result.carriers).toEqual([]);
    expect(result.summary).not.toHaveProperty('carrierCost');
    expect(result.money[0]).not.toHaveProperty('margin');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
    for (const call of prisma.$queryRaw.mock.calls) expect(call[0].values).toContain('230155');
  });

  it('rejects a tenant trying to request another customer', () => {
    const controller = new AnalyticsController({ get: jest.fn() } as never);
    expect(() => controller.get({ customerId: '999999' }, { id: 'user', email: 'a@example.com', name: null, role: Role.CUSTOMER, customerId: '230155' })).toThrow(ForbiddenException);
  });
});
