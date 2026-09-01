import { PrismaService } from '../src/prisma/prisma.service';
import { CustomerSipTraceService } from '../src/sip-trace/customer-sip-trace.service';
import { SipTraceService } from '../src/sip-trace/sip-trace.service';

describe('CustomerSipTraceService', () => {
  it('syncs, prunes, and returns only the newest 100 tenant-owned rows', async () => {
    const executeRaw = jest.fn().mockResolvedValue(0);
    const findMany = jest.fn().mockResolvedValue([
      {
        id: BigInt(42),
        cdrId: BigInt(9001),
        sessionUuid: 'session-1',
        callIds: ['a-leg', 'b-leg'],
        correlationId: 'session-1',
        direction: 'INBOUND',
        callerNumber: '14372905077',
        calledNumber: '15802051753',
        customerNumber: '15802051753',
        status: 'ANSWERED',
        responseCode: 200,
        durationSeconds: 12,
        sourceIp: '51.79.127.122',
        destinationIp: '51.79.127.124',
        captureId: 61,
        startedAt: new Date('2026-08-31T12:00:00.000Z'),
        endedAt: new Date('2026-08-31T12:00:12.000Z'),
        syncedAt: null,
      },
    ]);
    const prisma = {
      $executeRaw: executeRaw,
      customerSipTrace: { findMany },
    } as unknown as PrismaService;
    const service = new CustomerSipTraceService(prisma, {} as SipTraceService);

    const result = await service.list('customer-a');

    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: 'customer-a' },
        take: 100,
      }),
    );
    expect(result).toMatchObject({
      limit: 100,
      total: 1,
      data: [
        {
          id: '42',
          cdrId: '9001',
          callIds: ['a-leg', 'b-leg'],
          hasSnapshot: false,
        },
      ],
    });
  });
});
