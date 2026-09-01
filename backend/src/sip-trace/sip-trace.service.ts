import {
  BadGatewayException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  SearchSipTraceDto,
  SipTraceWindowDto,
} from './dto/search-sip-trace.dto';

type JsonRecord = Record<string, unknown>;

export type SipMessage = {
  id: string;
  callId: string;
  timestamp: string;
  timestampMs: number;
  method: string;
  methodText: string;
  responseCode: number | null;
  cseqMethod: string | null;
  caller: string | null;
  callee: string | null;
  srcIp: string;
  dstIp: string;
  srcPort: number;
  dstPort: number;
  captureId: number | null;
  node: string | null;
  correlationId: string | null;
  protocol: string;
  hasSdp: boolean;
  raw: string;
};

@Injectable()
export class SipTraceService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async search(query: SearchSipTraceDto) {
    const now = Date.now();
    const from = query.from ? new Date(query.from).getTime() : now - 3_600_000;
    const to = query.to ? new Date(query.to).getTime() : now;
    const filter: JsonRecord = { proto_type: 1, event_type: 'call' };
    if (query.callId) filter.call_id = query.callId;
    if (query.method) filter.method = query.method.toUpperCase();
    if (query.responseCode) filter.method = query.responseCode;
    if (query.caller) filter.from_user = query.caller;
    if (query.callee) filter.to_user = query.callee;
    if (query.srcIp) filter.src_ip = query.srcIp;
    if (query.dstIp) filter.dst_ip = query.dstIp;
    if (query.srcPort) filter.src_port = query.srcPort;
    if (query.dstPort) filter.dst_port = query.dstPort;
    if (query.captureId !== undefined) filter.capture_id = query.captureId;
    if (query.node) filter.node = query.node;

    const payload = await this.homer('/api/v4/transactions/search', {
      filter,
      param: {
        limit: query.limit,
        search: {
          ...(query.cseqMethod ? { cseq_method: query.cseqMethod } : {}),
          ...(query.correlationId
            ? { correlation_id: query.correlationId }
            : {}),
        },
      },
      timestamp: { from, to },
    });
    let items = this.items(payload).map((row) => this.normalizeSearchRow(row));
    // Transaction search rows do not always include the raw SIP CSeq/header
    // fields. In that case Homer has already applied param.search, so avoid
    // discarding valid rows merely because the compact result omitted them.
    if (query.cseqMethod && items.some((item) => item.cseqMethod)) {
      const cseq = query.cseqMethod.toUpperCase();
      items = items.filter((item) => item.cseqMethod === cseq);
    }
    if (query.correlationId && items.some((item) => item.correlationId)) {
      const correlation = query.correlationId.toLowerCase();
      items = items.filter((item) =>
        item.correlationId?.toLowerCase().includes(correlation),
      );
    }
    items = await this.filterRelevantMessages(items, from, to);
    return {
      data: items,
      total: items.length,
      window: {
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
      },
    };
  }

  async detailFromMessages(callId: string, messages: SipMessage[]) {
    const ordered = [...messages].sort((a, b) => a.timestampMs - b.timestampMs);
    const startedAt = ordered[0]?.timestamp ?? null;
    const endedAt = ordered.at(-1)?.timestamp ?? null;
    const durationMs = ordered.length
      ? ordered.at(-1)!.timestampMs - ordered[0].timestampMs
      : 0;
    const firstInvite = ordered.find((message) => message.method === 'INVITE');
    const finalInviteResponse = [...ordered]
      .reverse()
      .find(
        (message) =>
          (message.responseCode ?? 0) >= 200 &&
          (!message.cseqMethod || message.cseqMethod === 'INVITE'),
      );
    const finalResponse =
      finalInviteResponse ??
      [...ordered]
        .reverse()
        .find((message) => (message.responseCode ?? 0) >= 200);
    const participants = this.participants(ordered);
    return {
      call: {
        callId,
        startedAt,
        endedAt,
        durationMs,
        caller: firstInvite?.caller ?? ordered[0]?.caller ?? null,
        callee: firstInvite?.callee ?? ordered[0]?.callee ?? null,
        finalResponse: finalResponse?.responseCode ?? null,
        messageCount: ordered.length,
        participantCount: participants.length,
      },
      callId,
      participants,
      messages: ordered,
    };
  }

  async detail(callId: string, window: SipTraceWindowDto) {
    const result = await this.messages(callId, window);
    return this.detailFromMessages(callId, result.messages);
  }

  async messages(callId: string, window: SipTraceWindowDto) {
    const timestamp = this.window(window);
    const payload = await this.homer('/api/v4/transactions/messages', {
      ...this.sessions(callId, window.callIds),
      proto_type: 1,
      event_type: 'call',
      timestamp,
    });
    const messages = this.items(payload)
      .map((row) => this.normalizeMessage(row, callId))
      .sort((a, b) => a.timestampMs - b.timestampMs);
    return { callId, participants: this.participants(messages), messages };
  }

  async flow(callId: string, window: SipTraceWindowDto) {
    const result = await this.messages(callId, window);
    const firstTimestamp = result.messages[0]?.timestampMs ?? 0;
    return {
      callId,
      participants: result.participants,
      messages: result.messages.map((message) => ({
        ...message,
        elapsedMs: message.timestampMs - firstTimestamp,
        fromIndex: result.participants.indexOf(
          `${message.srcIp}:${message.srcPort}`,
        ),
        toIndex: result.participants.indexOf(
          `${message.dstIp}:${message.dstPort}`,
        ),
      })),
    };
  }

  async raw(callId: string, window: SipTraceWindowDto) {
    const result = await this.messages(callId, window);
    return {
      callId,
      data: result.messages.map(({ id, timestamp, method, raw }) => ({
        id,
        timestamp,
        method,
        raw,
      })),
    };
  }

  async logs(callId: string, window: SipTraceWindowDto) {
    const payload = await this.homer('/api/v4/transactions/events', {
      ...this.sessions(callId, window.callIds),
      proto_type: 1,
      event_type: 'call',
      timestamp: this.window(window),
    });
    return { callId, data: this.items(payload) };
  }

  async rtcp(callId: string, window: SipTraceWindowDto) {
    const payload = await this.homer('/api/v4/transactions/qos', {
      ...this.sessions(callId, window.callIds),
      proto_type: 1,
      event_type: 'call',
      timestamp: this.window(window),
    });
    return { callId, data: payload };
  }

  private window(window: SipTraceWindowDto) {
    const now = Date.now();
    return {
      from: window.from
        ? new Date(window.from).getTime()
        : now - 24 * 60 * 60 * 1000,
      to: window.to ? new Date(window.to).getTime() : now,
    };
  }

  private sessions(callId: string, related?: string) {
    const ids = [
      ...new Set(
        [callId, ...(related?.split(',') ?? [])]
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ].slice(0, 50);
    return ids.length > 1 ? { session_ids: ids } : { session_id: callId };
  }

  private async homer(path: string, body: unknown): Promise<unknown> {
    const baseUrl = this.config
      .get<string>('HOMER_API_BASE_URL')
      ?.replace(/\/$/, '');
    const token = this.config.get<string>('HOMER_API_TOKEN')?.trim();
    if (!baseUrl || !token) {
      throw new ServiceUnavailableException(
        'SIP trace requires HOMER_API_BASE_URL and a valid HOMER_API_TOKEN',
      );
    }
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Auth-Token': token,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      const text = await response.text();
      const payload: unknown = text ? JSON.parse(text) : null;
      if (!response.ok) {
        const message = this.string(this.record(payload), 'message');
        throw new BadGatewayException(
          response.status === 401
            ? 'Homer rejected HOMER_API_TOKEN (HTTP 401)'
            : message || `Homer returned HTTP ${response.status}`,
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadGatewayException(
        `Unable to query Homer: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private items(payload: unknown): JsonRecord[] {
    const root = this.record(payload);
    const data = root.data;
    if (Array.isArray(data)) return data.map((item) => this.record(item));
    const nested = this.record(data).items;
    return Array.isArray(nested) ? nested.map((item) => this.record(item)) : [];
  }

  private normalizeSearchRow(row: JsonRecord): SipMessage {
    return this.normalizeMessage(
      row,
      this.string(row, 'sid', 'session_id', 'call_id'),
    );
  }

  private normalizeMessage(
    row: JsonRecord,
    fallbackCallId: string,
  ): SipMessage {
    const protocol = this.record(row.protocol_header);
    const data = this.record(row.data_header);
    const raw = this.string(row, 'raw', 'payload');
    const methodText = this.string(row, 'method_text') || this.firstLine(raw);
    const method =
      this.string(data, 'method') ||
      this.string(row, 'method', 'event') ||
      this.methodFromRaw(raw);
    const timestampMs = this.timestamp(row, protocol);
    const responseMatch =
      /^(\d{3})(?:\s|$)/.exec(method) || /SIP\/2\.0\s+(\d{3})/.exec(raw);
    const cseqMethod =
      /^CSeq:\s*\d+\s+([^\s]+)/im.exec(raw)?.[1]?.toUpperCase() ?? null;
    const correlationId =
      (/^(?:X-Billing-Trace-ID|X-Correlation-ID|X-CTID|CTID):\s*([^\r\n]+)/im
        .exec(raw)?.[1]
        ?.trim() ??
        this.string(row, 'correlation_id', 'cid')) ||
      null;
    return {
      id:
        this.string(row, 'id', 'uuid') ||
        `${fallbackCallId}-${timestampMs}-${method}`,
      callId:
        this.string(data, 'call_id') ||
        this.string(row, 'sid', 'session_id', 'call_id') ||
        fallbackCallId,
      timestamp: new Date(timestampMs).toISOString(),
      timestampMs,
      method,
      methodText,
      responseCode: responseMatch ? Number(responseMatch[1]) : null,
      cseqMethod,
      caller: this.nullable(
        this.string(row, 'caller', 'from_user') ||
          this.string(data, 'from_user'),
      ),
      callee: this.nullable(
        this.string(row, 'callee', 'to_user') ||
          this.string(data, 'to_user', 'ruri_user'),
      ),
      srcIp: this.string(protocol, 'src_ip') || this.string(row, 'src_ip'),
      dstIp: this.string(protocol, 'dst_ip') || this.string(row, 'dst_ip'),
      srcPort:
        this.number(protocol, 'src_port') || this.number(row, 'src_port'),
      dstPort:
        this.number(protocol, 'dst_port') || this.number(row, 'dst_port'),
      captureId:
        this.optionalNumber(protocol, 'capture_id') ??
        this.optionalNumber(row, 'capture_id'),
      node: this.nullable(this.string(row, 'node', 'storage_lake')),
      correlationId,
      protocol: this.number(protocol, 'protocol') === 6 ? 'TCP' : 'UDP',
      hasSdp:
        /Content-Type:\s*application\/sdp|(?:^|\r?\n)v=0(?:\r?\n|$)/i.test(raw),
      raw,
    };
  }

  private participants(messages: SipMessage[]) {
    return [
      ...new Set(
        messages
          .flatMap((message) => [
            `${message.srcIp}:${message.srcPort}`,
            `${message.dstIp}:${message.dstPort}`,
          ])
          .filter((participant) => participant !== ':0'),
      ),
    ];
  }

  private async filterRelevantMessages(
    messages: SipMessage[],
    from: number,
    to: number,
  ) {
    if (!messages.length) return messages;
    const [numberRows, sourceRows, cdrRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ number: string }>>(Prisma.sql`
        SELECT DISTINCT canonical_number AS number
        FROM global_number_inventory
      `),
      this.prisma.$queryRaw<Array<{ ip: string }>>(Prisma.sql`
        SELECT DISTINCT ip_address AS ip
        FROM source_ip_auth
        WHERE is_active = TRUE
        UNION
        SELECT DISTINCT host AS ip FROM carrier_endpoints WHERE is_active = TRUE
        UNION
        SELECT DISTINCT host AS ip FROM customer_endpoints WHERE is_active = TRUE
      `),
      this.prisma.$queryRaw<
        Array<{
          callerNumber: string | null;
          destinationNumber: string | null;
          customerNumber: string | null;
          aLegSipCallId: string | null;
          bLegSipCallIds: string[];
        }>
      >(Prisma.sql`
        SELECT record.caller_number AS "callerNumber",
               record.destination_number AS "destinationNumber",
               inventory.canonical_number AS "customerNumber",
               record.a_leg_sip_call_id AS "aLegSipCallId",
               record.b_leg_sip_call_ids AS "bLegSipCallIds"
        FROM cdr AS record
        LEFT JOIN customer_numbers AS assigned
          ON assigned.id = record.customer_number_id
         AND assigned.customer_id = record.customer_id
        LEFT JOIN global_number_inventory AS inventory
          ON inventory.id = assigned.inventory_id
        WHERE record.started_at >= ${new Date(from - 300_000)}
          AND record.started_at <= ${new Date(to + 300_000)}
      `),
    ]);
    const ownedNumbers = new Set(
      numberRows.map((row) => this.numberKey(row.number)).filter(Boolean),
    );
    const ownedCallIds = new Set<string>();
    for (const cdr of cdrRows) {
      const containsOwnedNumber = [
        cdr.callerNumber,
        cdr.destinationNumber,
        cdr.customerNumber,
      ]
        .map((value) => this.numberKey(value))
        .some((value) => value && ownedNumbers.has(value));
      if (!containsOwnedNumber) continue;
      if (cdr.aLegSipCallId) ownedCallIds.add(cdr.aLegSipCallId);
      for (const callId of cdr.bLegSipCallIds ?? []) ownedCallIds.add(callId);
    }
    const knownSources = new Set(sourceRows.map((row) => row.ip));
    return messages.filter((message) => {
      const fromOwnedCall = ownedCallIds.has(message.callId);
      if (this.isAnonymous(message.caller) && !fromOwnedCall) return false;
      const containsOwnedNumber = [message.caller, message.callee]
        .map((value) => this.numberKey(value))
        .some((value) => value && ownedNumbers.has(value));
      const knownSource = knownSources.has(message.srcIp);
      return fromOwnedCall || (containsOwnedNumber && knownSource);
    });
  }

  private numberKey(value: string | null | undefined) {
    return value?.replace(/\D/g, '') ?? '';
  }

  private isAnonymous(value: string | null | undefined) {
    return /^(anonymous|unknown|restricted|private)$/i.test(
      value?.trim() ?? '',
    );
  }

  private timestamp(row: JsonRecord, protocol: JsonRecord) {
    const seconds = this.optionalNumber(protocol, 'time_seconds');
    if (seconds !== null) {
      return (
        seconds * 1000 +
        (this.optionalNumber(protocol, 'time_useconds') ?? 0) / 1000
      );
    }
    for (const key of ['timestamp', 'create_date']) {
      const value = row[key];
      if (typeof value === 'string' && value) {
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    const value =
      this.optionalNumber(row, 'timestamp', 'create_date', 'micro_ts') ??
      Date.now();
    if (value > 1e15) return value / 1000;
    if (value > 1e12) return value;
    return value * 1000;
  }

  private firstLine(raw: string) {
    return raw.split(/\r?\n/, 1)[0] ?? '';
  }

  private methodFromRaw(raw: string) {
    const line = this.firstLine(raw);
    if (line.startsWith('SIP/2.0')) return line.replace(/^SIP\/2\.0\s*/, '');
    return line.split(' ', 1)[0] || 'UNKNOWN';
  }

  private record(value: unknown): JsonRecord {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as JsonRecord)
      : {};
  }

  private string(record: JsonRecord, ...keys: string[]) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value) return value;
      if (typeof value === 'number') return String(value);
    }
    return '';
  }

  private number(record: JsonRecord, ...keys: string[]) {
    return this.optionalNumber(record, ...keys) ?? 0;
  }

  private optionalNumber(record: JsonRecord, ...keys: string[]) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && value && Number.isFinite(Number(value)))
        return Number(value);
    }
    return null;
  }

  private nullable(value: string) {
    return value || null;
  }
}
