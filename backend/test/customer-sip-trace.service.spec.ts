import { PrismaService } from '../src/prisma/prisma.service';
import { CustomerSipTraceService } from '../src/sip-trace/customer-sip-trace.service';
import { SipTraceService } from '../src/sip-trace/sip-trace.service';

describe('CustomerSipTraceService', () => {
  it('limits tenant results to 50 and masks configured internal IPs', async () => {
    const original = process.env.SIP_TRACE_TENANT_HIDDEN_IPS;
    process.env.SIP_TRACE_TENANT_HIDDEN_IPS = '10.30.0.58';
    try {
      const findMany = jest.fn().mockResolvedValue([{ id: 1n, cdrId: 2n, sourceIp: '10.30.0.58', destinationIp: '51.79.127.125', syncedAt: null }]);
      const service = new CustomerSipTraceService(
        { customerSipTrace: { findMany } } as unknown as PrismaService,
        {} as SipTraceService,
      );
      const result = await service.list('tenant-1', true);
      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
      expect(result.data[0].sourceIp).toBe('[Switch internal]');
      expect(result.data[0].destinationIp).toBe('51.79.127.125');
    } finally {
      if (original === undefined) delete process.env.SIP_TRACE_TENANT_HIDDEN_IPS;
      else process.env.SIP_TRACE_TENANT_HIDDEN_IPS = original;
    }
  });

  it('removes internal-hop packets and redacts sensitive headers before tenant flow', async () => {
    const original = process.env.SIP_TRACE_TENANT_HIDDEN_IPS;
    process.env.SIP_TRACE_TENANT_HIDDEN_IPS = '10.30.0.58';
    try {
      const timestamp = Date.parse('2026-11-13T12:00:00Z');
      const message = (id: string, srcIp: string, dstIp: string) => ({
        id, callId: 'call-1', timestamp: new Date(timestamp).toISOString(), timestampMs: timestamp,
        method: 'INVITE', methodText: 'INVITE', responseCode: null, cseqMethod: 'INVITE',
        caller: '123', callee: '456', srcIp, dstIp, srcPort: 5060, dstPort: 5070,
        captureId: null, node: null, correlationId: null, protocol: 'udp', hasSdp: false,
        raw: 'INVITE sip:456@10.30.0.58 SIP/2.0\r\nAuthorization: secret\r\n',
      });
      const trace = {
        id: 1n, customerId: 'tenant-1', callIds: ['call-1'], sessionUuid: 'session-1',
        startedAt: new Date(timestamp), endedAt: new Date(timestamp + 1000),
        messagesSnapshot: [message('internal', '10.30.0.58', '51.79.127.125'), message('public', '51.79.127.125', '91.99.251.58')],
      };
      const flowFromMessages = jest.fn().mockResolvedValue({ messages: [] });
      const service = new CustomerSipTraceService(
        { customerSipTrace: { findFirst: jest.fn().mockResolvedValue(trace), count: jest.fn().mockResolvedValue(0) } } as unknown as PrismaService,
        { flowFromMessages } as unknown as SipTraceService,
      );
      await service.flow('tenant-1', '1', true);
      const visible = flowFromMessages.mock.calls[0][1];
      expect(visible).toHaveLength(1);
      expect(visible[0].id).toBe('public');
      expect(visible[0].raw).not.toContain('10.30.0.58');
      expect(visible[0].raw).not.toContain('Authorization: secret');
    } finally {
      if (original === undefined) delete process.env.SIP_TRACE_TENANT_HIDDEN_IPS;
      else process.env.SIP_TRACE_TENANT_HIDDEN_IPS = original;
    }
  });

  it('does not allow tenant access to a trace older than the newest 50', async () => {
    const trace = { id: 1n, customerId: 'tenant-1', startedAt: new Date('2026-11-01T00:00:00Z') };
    const prisma = {
      customerSipTrace: {
        findFirst: jest.fn().mockResolvedValue(trace),
        count: jest.fn().mockResolvedValue(50),
      },
    } as unknown as PrismaService;
    const service = new CustomerSipTraceService(prisma, {} as SipTraceService);
    await expect(service.flow('tenant-1', '1', true)).rejects.toThrow('SIP trace not found');
  });
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
