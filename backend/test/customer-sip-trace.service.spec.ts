import { PrismaService } from '../src/prisma/prisma.service';
import { CustomerSipTraceService } from '../src/sip-trace/customer-sip-trace.service';
import { SipTraceService } from '../src/sip-trace/sip-trace.service';

describe('CustomerSipTraceService', () => {
  it('returns the newest 100 tenant-owned rows without synchronizing on read', async () => {
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

    expect(executeRaw).not.toHaveBeenCalled();
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

  it('returns filtered merged calls for the global debugger without querying Homer', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: BigInt(43),
        cdrId: BigInt(9002),
        sessionUuid: 'session-2',
        callIds: ['a-leg-2', 'b-leg-2'],
        correlationId: 'session-2',
        direction: 'OUTBOUND',
        callerNumber: '14372905077',
        calledNumber: '15802051753',
        customerNumber: '14372905077',
        status: 'ANSWERED',
        responseCode: 200,
        durationSeconds: 18,
        sourceIp: '51.79.127.124',
        destinationIp: '64.227.10.111',
        captureId: 61,
        startedAt: new Date('2026-09-02T12:00:00.000Z'),
        endedAt: new Date('2026-09-02T12:00:18.000Z'),
        syncedAt: new Date('2026-09-02T12:01:00.000Z'),
        customer: {
          id: 'customer-a',
          name: 'Customer A',
          accountCode: 'CUST-A',
        },
      },
    ]);
    const prisma = {
      customerSipTrace: { findMany },
    } as unknown as PrismaService;
    const messages = jest.fn();
    const sipTrace = { messages } as unknown as SipTraceService;
    const service = new CustomerSipTraceService(prisma, sipTrace);

    const result = await service.listGlobal({
      caller: '1437',
      direction: 'OUTBOUND',
      limit: 200,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 200,
        where: expect.objectContaining({
          direction: 'OUTBOUND',
          callerNumber: { contains: '1437', mode: 'insensitive' },
        }),
      }),
    );
    expect(messages).not.toHaveBeenCalled();
    expect(result.data[0]).toMatchObject({
      id: '43',
      cdrId: '9002',
      callIds: ['a-leg-2', 'b-leg-2'],
      customer: { id: 'customer-a', name: 'Customer A' },
    });
  });
});
