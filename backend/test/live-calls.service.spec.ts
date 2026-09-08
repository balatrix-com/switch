import { LiveCallsService } from '../src/live-calls/live-calls.service';

describe('LiveCallsService', () => {
  const emptyPrisma = {
    customer: { findMany: jest.fn().mockResolvedValue([]) },
    carrierEndpoint: { findMany: jest.fn().mockResolvedValue([]) },
  };

  it('wakes the poller and returns an empty snapshot while it starts', async () => {
    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      disconnect: jest.fn(),
    };
    const service = new LiveCallsService(redis as any, emptyPrisma as any);

    await expect(service.list()).resolves.toMatchObject({
      calls: [],
      summary: { activeCalls: 0, activeChannels: 0 },
    });
    expect(redis.set).toHaveBeenCalledWith(
      'livecalls:wake',
      expect.any(String),
      'EX',
      600,
    );
    expect(redis.get).toHaveBeenCalledWith('livecalls:data');
  });

  it('reads and enriches a cached snapshot', async () => {
    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(
        JSON.stringify({
          ok: true,
          calls: [
            {
              uuid: 'call-1',
              accountcode: '178254',
              direction: 'inbound',
              remoteIp: '203.0.113.10',
            },
          ],
          summary: { activeChannels: 2 },
          polledAt: 123,
        }),
      ),
      disconnect: jest.fn(),
    };
    const prisma = {
      customer: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'customer-id', accountCode: '178254', name: 'Tenant' },
          ]),
      },
      carrierEndpoint: {
        findMany: jest.fn().mockResolvedValue([
          {
            host: '203.0.113.10',
            carrier: { id: 'carrier-id', name: 'Carrier' },
          },
        ]),
      },
    };
    const service = new LiveCallsService(redis as any, prisma as any);

    const result = await service.list();
    expect(result.summary).toMatchObject({
      activeCalls: 1,
      activeChannels: 2,
      inbound: 1,
    });
    expect(result.calls[0]).toMatchObject({
      customer: { name: 'Tenant' },
      carrier: { name: 'Carrier' },
    });
  });
});
