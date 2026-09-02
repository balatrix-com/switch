import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { SipTraceService } from '../src/sip-trace/sip-trace.service';

describe('SipTraceService', () => {
  const fetchMock = jest.fn();
  const queryMock = jest.fn();
  let service: SipTraceService;

  beforeEach(() => {
    fetchMock.mockReset();
    queryMock.mockReset();
    queryMock
      .mockResolvedValueOnce([{ number: '15802051753' }])
      .mockResolvedValueOnce([{ ip: '51.79.127.124' }])
      .mockResolvedValueOnce([]);
    global.fetch = fetchMock as typeof fetch;
    service = new SipTraceService(
      new ConfigService({
        HOMER_API_BASE_URL: 'http://homer.test:9088',
        HOMER_API_TOKEN: 'test-token',
      }),
      { $queryRaw: queryMock } as unknown as PrismaService,
    );
  });

  it('normalizes Homer search rows and sends the static token', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'packet-1',
              sid: 'call-1',
              method: 'INVITE',
              from_user: '14372905077',
              to_user: '15802051753',
              src_ip: '51.79.127.124',
              dst_ip: '91.99.251.61',
              src_port: 5070,
              dst_port: 5060,
              capture_id: 61,
              create_date: 1_777_000_000_000,
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await service.search({
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-24T00:00:00.000Z',
      limit: 100,
      cseqMethod: 'INVITE',
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      callId: 'call-1',
      method: 'INVITE',
      caller: '14372905077',
      callee: '15802051753',
      srcIp: '51.79.127.124',
      captureId: 61,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://homer.test:9088/api/v4/transactions/search',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Auth-Token': 'test-token' }),
      }),
    );
  });

  it('combines related call legs and derives a chronological ladder', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'bye',
              sid: 'b-leg',
              protocol_header: {
                src_ip: '91.99.251.61',
                dst_ip: '51.79.127.124',
                src_port: 5060,
                dst_port: 5070,
                capture_id: 61,
                protocol: 17,
                time_seconds: 1_777_000_010,
              },
              data_header: { call_id: 'b-leg', method: 'BYE' },
              raw: 'BYE sip:14372905077@example.test SIP/2.0\r\nCSeq: 2 BYE\r\n',
            },
            {
              id: 'invite',
              sid: 'a-leg',
              protocol_header: {
                src_ip: '10.30.0.61',
                dst_ip: '91.99.251.61',
                src_port: 5070,
                dst_port: 5060,
                capture_id: 61,
                protocol: 17,
                time_seconds: 1_777_000_000,
              },
              data_header: {
                call_id: 'a-leg',
                method: 'INVITE',
                from_user: '14372905077',
                to_user: '15802051753',
              },
              raw: 'INVITE sip:15802051753@example.test SIP/2.0\r\nCSeq: 1 INVITE\r\nContent-Type: application/sdp\r\n',
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await service.flow('a-leg', { callIds: 'a-leg,b-leg' });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      session_ids: ['a-leg', 'b-leg'],
    });
    expect(result.messages.map((message) => message.method)).toEqual([
      'INVITE',
      'BYE',
    ]);
    expect(result.messages[0]).toMatchObject({
      elapsedMs: 0,
      fromIndex: 0,
      toIndex: 1,
      hasSdp: true,
      rawAvailable: true,
    });
    expect(result.messages[0]).not.toHaveProperty('raw');
    expect(result.call).toMatchObject({ messageCount: 2, participantCount: 3 });
    expect(result.messages[1].elapsedMs).toBe(10_000);
  });

  it('hides anonymous scanner traffic that is not mapped to the switch', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'scanner-packet',
              sid: 'scanner-call',
              method: 'INVITE',
              from_user: 'anonymous',
              to_user: '100',
              src_ip: '203.0.113.77',
              dst_ip: '91.99.251.61',
              src_port: 43321,
              dst_port: 5060,
              capture_id: 61,
              create_date: 1_777_000_000_000,
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await service.search({
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-24T00:00:00.000Z',
      limit: 100,
    });

    expect(result.data).toEqual([]);
  });

  it('keeps a valid CDR call even when its first captured source is unknown', async () => {
    queryMock.mockReset();
    queryMock
      .mockResolvedValueOnce([{ number: '15802051753' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          callerNumber: '14372905077',
          destinationNumber: '15802051753',
          aLegSipCallId: 'rated-call',
          bLegSipCallIds: ['rated-b-leg'],
        },
      ]);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'rated-packet',
              sid: 'rated-call',
              method: 'INVITE',
              from_user: 'anonymous',
              to_user: '15802051753',
              src_ip: '203.0.113.77',
              dst_ip: '91.99.251.61',
              src_port: 43321,
              dst_port: 5060,
              capture_id: 61,
              create_date: 1_777_000_000_000,
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await service.search({
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-24T00:00:00.000Z',
      limit: 100,
    });

    expect(result.data.map((message) => message.callId)).toEqual([
      'rated-call',
    ]);
  });

  it('does not treat external CDR caller or destination numbers as owned', async () => {
    queryMock.mockReset();
    queryMock
      .mockResolvedValueOnce([{ number: '18135886277' }])
      .mockResolvedValueOnce([{ ip: '51.79.127.124' }])
      .mockResolvedValueOnce([
        {
          callerNumber: '12154697099',
          destinationNumber: '15802051753',
          customerNumber: null,
          aLegSipCallId: 'external-only-call',
          bLegSipCallIds: [],
        },
      ]);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              sid: 'external-only-call',
              method: 'INVITE',
              from_user: '12154697099',
              to_user: '15802051753',
              src_ip: '51.79.127.124',
              dst_ip: '91.99.251.61',
              create_date: 1_777_000_000_000,
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await service.search({
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-24T00:00:00.000Z',
      limit: 100,
    });

    expect(result.data).toEqual([]);
  });

  it('parses Homer ISO timestamps so ladder timing uses real call time', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              sid: 'iso-call',
              timestamp: '2026-08-31T15:20:51.735947Z',
              method: 'INVITE',
              from_user: '14372905077',
              to_user: '15802051753',
              src_ip: '51.79.127.124',
              dst_ip: '91.99.251.61',
            },
            {
              sid: 'iso-call',
              timestamp: '2026-08-31T15:21:04.100000Z',
              method: 'BYE',
              from_user: '14372905077',
              to_user: '15802051753',
              src_ip: '51.79.127.124',
              dst_ip: '91.99.251.61',
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await service.detail('iso-call', {});

    expect(result.call.startedAt).toBe('2026-08-31T15:20:51.735Z');
    expect(result.call.durationMs).toBe(12_365);
  });
});
