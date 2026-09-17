import { LiveCallsService } from '../src/live-calls/live-calls.service';

describe('LiveCallsService', () => {
  const config = { get: jest.fn((_key: string, fallback: string) => fallback) };
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
    const service = new LiveCallsService(
      redis as any,
      emptyPrisma as any,
      config as any,
    );

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
    const service = new LiveCallsService(
      redis as any,
      prisma as any,
      config as any,
    );

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

  it('rejects listen when no active monitor extension exists', async () => {
    const redis = { disconnect: jest.fn() };
    const prisma = {
      sipUser: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new LiveCallsService(
      redis as any,
      prisma as any,
      config as any,
    );
    await expect(
      service.listen('cust-1', '123e4567-e89b-42d3-a456-426614174000'),
    ).rejects.toThrow('No monitoring extension configured');
  });

  it('rings the active monitor extension through the route service', async () => {
    const redis = { disconnect: jest.fn() };
    const prisma = {
      sipUser: { findFirst: jest.fn().mockResolvedValue({ username: '900' }) },
    };
    const service = new LiveCallsService(
      redis as any,
      prisma as any,
      config as any,
    );
    jest.spyOn(service, 'list').mockResolvedValue({
      ok: true,
      calls: [{ uuid: '123e4567-e89b-42d3-a456-426614174000' }],
      summary: {},
      polledAt: 1,
    });
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    await expect(
      service.listen('cust-1', '123e4567-e89b-42d3-a456-426614174000'),
    ).resolves.toMatchObject({ extension: '900' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/calls/listen',
      expect.objectContaining({ method: 'POST' }),
    );
    fetchMock.mockRestore();
  });

  it('refuses to listen to a call outside the customer tenant', async () => {
    const service = new LiveCallsService(
      { disconnect: jest.fn() } as any,
      { sipUser: { findFirst: jest.fn().mockResolvedValue({ username: '900' }) } } as any,
      config as any,
    );
    jest.spyOn(service, 'list').mockResolvedValue({ ok: true, calls: [], summary: {}, polledAt: 1 });
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(service.listen('cust-1', '123e4567-e89b-42d3-a456-426614174000')).rejects.toThrow('Live call not found for this customer');
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
