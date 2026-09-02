import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  CustomerSipTrace as CustomerSipTraceRecord,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SipMessage, SipTraceService } from './sip-trace.service';
import { SearchIndexedSipTraceDto } from './dto/search-sip-trace.dto';

const CUSTOMER_TRACE_LIMIT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CustomerSipTraceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CustomerSipTraceService.name);
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sipTrace: SipTraceService,
  ) {}

  onModuleInit() {
    void this.dailyMaintenance();
    this.cleanupTimer = setInterval(() => void this.dailyMaintenance(), DAY_MS);
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async list(customerId: string) {
    const rows = await this.prisma.customerSipTrace.findMany({
      where: { customerId },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: CUSTOMER_TRACE_LIMIT,
      select: {
        id: true,
        cdrId: true,
        sessionUuid: true,
        callIds: true,
        correlationId: true,
        direction: true,
        callerNumber: true,
        calledNumber: true,
        customerNumber: true,
        status: true,
        responseCode: true,
        durationSeconds: true,
        sourceIp: true,
        destinationIp: true,
        captureId: true,
        startedAt: true,
        endedAt: true,
        syncedAt: true,
      },
    });
    return {
      data: rows.map((row) => ({
        ...row,
        id: row.id.toString(),
        cdrId: row.cdrId.toString(),
        hasSnapshot: Boolean(row.syncedAt),
      })),
      limit: CUSTOMER_TRACE_LIMIT,
      total: rows.length,
    };
  }

  async listGlobal(query: SearchIndexedSipTraceDto) {
    const limit = query.limit ?? 200;
    const where: Prisma.CustomerSipTraceWhereInput = {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.caller
        ? { callerNumber: { contains: query.caller, mode: 'insensitive' } }
        : {}),
      ...(query.callee
        ? { calledNumber: { contains: query.callee, mode: 'insensitive' } }
        : {}),
      ...(query.customerNumber
        ? {
            customerNumber: {
              contains: query.customerNumber,
              mode: 'insensitive',
            },
          }
        : {}),
      ...(query.srcIp
        ? { sourceIp: { contains: query.srcIp, mode: 'insensitive' } }
        : {}),
      ...(query.dstIp
        ? { destinationIp: { contains: query.dstIp, mode: 'insensitive' } }
        : {}),
      ...(query.responseCode ? { responseCode: query.responseCode } : {}),
      ...(query.direction ? { direction: query.direction } : {}),
      ...(query.from || query.to
        ? {
            startedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.callId
        ? {
            OR: [
              {
                sessionUuid: {
                  contains: query.callId,
                  mode: 'insensitive',
                },
              },
              {
                correlationId: {
                  contains: query.callId,
                  mode: 'insensitive',
                },
              },
              { callIds: { has: query.callId } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.customerSipTrace.findMany({
      where,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        cdrId: true,
        sessionUuid: true,
        callIds: true,
        correlationId: true,
        direction: true,
        callerNumber: true,
        calledNumber: true,
        customerNumber: true,
        status: true,
        responseCode: true,
        durationSeconds: true,
        sourceIp: true,
        destinationIp: true,
        captureId: true,
        startedAt: true,
        endedAt: true,
        syncedAt: true,
        customer: { select: { id: true, name: true, accountCode: true } },
      },
    });
    return {
      data: rows.map((row) => ({
        ...row,
        id: row.id.toString(),
        cdrId: row.cdrId.toString(),
        hasSnapshot: Boolean(row.syncedAt),
      })),
      limit,
      total: rows.length,
      window: {
        from: query.from ?? null,
        to: query.to ?? null,
      },
    };
  }

  async detail(customerId: string, id: string) {
    return this.detailForTrace(await this.findOwned(customerId, id));
  }

  async detailGlobal(id: string) {
    return this.detailForTrace(await this.findAny(id));
  }

  async messages(customerId: string, id: string) {
    const trace = await this.findOwned(customerId, id);
    const messages = await this.loadMessages(trace);
    return {
      callId: trace.callIds[0] ?? trace.sessionUuid,
      participants: this.sipTrace.participantsFromMessages(messages),
      messages,
    };
  }

  async flow(customerId: string, id: string) {
    return this.flowForTrace(await this.findOwned(customerId, id));
  }

  async flowGlobal(id: string) {
    return this.flowForTrace(await this.findAny(id));
  }

  async raw(customerId: string, id: string) {
    const trace = await this.findOwned(customerId, id);
    const messages = await this.loadMessages(trace);
    return {
      callId: trace.callIds[0] ?? trace.sessionUuid,
      data: messages.map(({ id: messageId, timestamp, method, raw }) => ({
        id: messageId,
        timestamp,
        method,
        raw,
      })),
    };
  }

  async rawMessage(customerId: string, id: string, messageId: string) {
    return this.rawMessageForTrace(
      await this.findOwned(customerId, id),
      messageId,
    );
  }

  async rawMessageGlobal(id: string, messageId: string) {
    return this.rawMessageForTrace(await this.findAny(id), messageId);
  }

  async logs(customerId: string, id: string) {
    return this.logsForTrace(await this.findOwned(customerId, id));
  }

  async logsGlobal(id: string) {
    return this.logsForTrace(await this.findAny(id));
  }

  async rtcp(customerId: string, id: string) {
    return this.rtcpForTrace(await this.findOwned(customerId, id));
  }

  async rtcpGlobal(id: string) {
    return this.rtcpForTrace(await this.findAny(id));
  }

  private async detailForTrace(trace: CustomerSipTraceRecord) {
    const messages = await this.loadMessages(trace);
    return this.sipTrace.detailFromMessages(
      trace.callIds[0] ?? trace.sessionUuid,
      messages,
    );
  }

  private async loadMessages(trace: CustomerSipTraceRecord) {
    const cached = this.snapshot(trace.messagesSnapshot);
    if (this.snapshotMatchesTrace(cached, trace)) {
      return cached;
    }
    const result = await this.sipTrace.messages(
      trace.callIds[0] ?? trace.sessionUuid,
      this.traceWindow(trace),
    );
    const detail = await this.sipTrace.detailFromMessages(
      trace.callIds[0] ?? trace.sessionUuid,
      result.messages,
    );
    if (result.messages.length) {
      const first = result.messages[0];
      await this.prisma.customerSipTrace.update({
        where: { id: trace.id },
        data: {
          messagesSnapshot: result.messages,
          participants: result.participants,
          responseCode: detail.call.finalResponse,
          correlationId:
            result.messages.find((message) => message.correlationId)
              ?.correlationId ?? trace.correlationId,
          sourceIp: first.srcIp || trace.sourceIp,
          destinationIp: first.dstIp || trace.destinationIp,
          syncedAt: new Date(),
        },
      });
    }
    return result.messages;
  }

  private async flowForTrace(trace: CustomerSipTraceRecord) {
    return this.sipTrace.flowFromMessages(
      trace.callIds[0] ?? trace.sessionUuid,
      await this.loadMessages(trace),
    );
  }

  private async rawMessageForTrace(
    trace: CustomerSipTraceRecord,
    messageId: string,
  ) {
    return this.sipTrace.rawMessageFromMessages(
      trace.callIds[0] ?? trace.sessionUuid,
      messageId,
      await this.loadMessages(trace),
    );
  }

  private logsForTrace(trace: CustomerSipTraceRecord) {
    return this.sipTrace.logs(
      trace.callIds[0] ?? trace.sessionUuid,
      this.traceWindow(trace),
    );
  }

  private rtcpForTrace(trace: CustomerSipTraceRecord) {
    return this.sipTrace.rtcp(
      trace.callIds[0] ?? trace.sessionUuid,
      this.traceWindow(trace),
    );
  }

  async syncFromCdr(customerId?: string) {
    const tenantFilter = customerId
      ? Prisma.sql`AND record.customer_id = ${customerId}`
      : Prisma.empty;
    await this.prisma.$executeRaw(Prisma.sql`
      WITH candidate_cdr AS (
        SELECT ranked.*
        FROM (
          SELECT record.*,
                 ROW_NUMBER() OVER (
                   PARTITION BY record.customer_id
                   ORDER BY COALESCE(record.started_at, record.created_at) DESC,
                            record.id DESC
                 ) AS trace_position
          FROM cdr AS record
          WHERE (
            record.a_leg_sip_call_id IS NOT NULL OR
            cardinality(record.b_leg_sip_call_ids) > 0
          )
          ${tenantFilter}
        ) AS ranked
        WHERE ranked.trace_position <= ${CUSTOMER_TRACE_LIMIT}
      )
      INSERT INTO customer_sip_traces (
        customer_id, customer_number_id, cdr_id, session_uuid, call_ids,
        correlation_id, direction, caller_number, called_number,
        customer_number, status, duration_seconds, source_ip, destination_ip,
        capture_id, started_at, ended_at, created_at, updated_at
      )
      SELECT
        record.customer_id,
        COALESCE(direct_number.id, matched_number.id),
        record.id,
        record.session_uuid,
        ARRAY(
          SELECT DISTINCT call_id
          FROM unnest(
            ARRAY[record.a_leg_sip_call_id] ||
            COALESCE(record.b_leg_sip_call_ids, ARRAY[]::TEXT[])
          ) AS call_id
          WHERE call_id IS NOT NULL AND call_id <> ''
        ),
        record.session_uuid,
        record.direction,
        record.caller_number,
        record.destination_number,
        COALESCE(direct_inventory.canonical_number, matched_number.canonical_number),
        record.call_status,
        record.duration_seconds,
        record.source_ip,
        CASE
          WHEN record.direction = 'INBOUND' THEN customer_destination.host
          ELSE carrier_destination.host
        END,
        record.homer_capture_id,
        COALESCE(record.started_at, record.created_at),
        record.ended_at,
        NOW(),
        NOW()
      FROM candidate_cdr AS record
      JOIN customers AS tenant ON tenant.id = record.customer_id
      LEFT JOIN customer_numbers AS direct_number
        ON direct_number.id = record.customer_number_id
       AND direct_number.customer_id = record.customer_id
       AND direct_number.status = 'ACTIVE'
      LEFT JOIN global_number_inventory AS direct_inventory
        ON direct_inventory.id = direct_number.inventory_id
      LEFT JOIN LATERAL (
        SELECT assigned.id, inventory.canonical_number
        FROM customer_numbers AS assigned
        JOIN global_number_inventory AS inventory
          ON inventory.id = assigned.inventory_id
        WHERE assigned.customer_id = record.customer_id
          AND assigned.status = 'ACTIVE'
          AND regexp_replace(inventory.canonical_number, '\\D', '', 'g') IN (
            regexp_replace(COALESCE(record.caller_number, ''), '\\D', '', 'g'),
            regexp_replace(COALESCE(record.destination_number, ''), '\\D', '', 'g')
          )
        ORDER BY
          CASE WHEN regexp_replace(inventory.canonical_number, '\\D', '', 'g') =
            regexp_replace(COALESCE(record.destination_number, ''), '\\D', '', 'g')
          THEN 0 ELSE 1 END,
          assigned.assigned_at DESC
        LIMIT 1
      ) AS matched_number ON TRUE
      LEFT JOIN customer_endpoints AS customer_destination
        ON customer_destination.id = record.customer_endpoint_id
      LEFT JOIN carrier_endpoints AS carrier_destination
        ON carrier_destination.id = record.carrier_endpoint_id
      WHERE COALESCE(direct_number.id, matched_number.id) IS NOT NULL
      ON CONFLICT (cdr_id) DO UPDATE SET
        customer_number_id = EXCLUDED.customer_number_id,
        call_ids = EXCLUDED.call_ids,
        direction = EXCLUDED.direction,
        caller_number = EXCLUDED.caller_number,
        called_number = EXCLUDED.called_number,
        customer_number = EXCLUDED.customer_number,
        status = EXCLUDED.status,
        duration_seconds = EXCLUDED.duration_seconds,
        source_ip = EXCLUDED.source_ip,
        destination_ip = EXCLUDED.destination_ip,
        ended_at = EXCLUDED.ended_at,
        updated_at = NOW()
    `);
  }

  async cleanup(customerId?: string) {
    const tenantPredicate = customerId
      ? Prisma.sql`trace.customer_id = ${customerId}`
      : Prisma.sql`TRUE`;
    return this.prisma.$executeRaw(Prisma.sql`
      WITH owned_ranked AS (
        SELECT trace.id,
               ROW_NUMBER() OVER (
                 PARTITION BY trace.customer_id
                 ORDER BY trace.started_at DESC, trace.id DESC
               ) AS position
        FROM customer_sip_traces AS trace
        JOIN customer_numbers AS assigned
          ON assigned.id = trace.customer_number_id
         AND assigned.customer_id = trace.customer_id
         AND assigned.status = 'ACTIVE'
        WHERE ${tenantPredicate}
      ), removals AS (
        SELECT trace.id
        FROM customer_sip_traces AS trace
        LEFT JOIN customer_numbers AS assigned
          ON assigned.id = trace.customer_number_id
         AND assigned.customer_id = trace.customer_id
         AND assigned.status = 'ACTIVE'
        WHERE ${tenantPredicate}
          AND assigned.id IS NULL
        UNION ALL
        SELECT id FROM owned_ranked WHERE position > ${CUSTOMER_TRACE_LIMIT}
      )
      DELETE FROM customer_sip_traces AS trace
      USING removals
      WHERE trace.id = removals.id
    `);
  }

  private async dailyMaintenance() {
    try {
      await this.syncFromCdr();
      const removed = await this.cleanup();
      this.logger.log(
        `Customer SIP trace maintenance complete; removed=${removed}`,
      );
    } catch (error) {
      this.logger.error(
        `Customer SIP trace maintenance failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private async findOwned(customerId: string, id: string) {
    if (!/^\d+$/.test(id)) throw new NotFoundException('SIP trace not found');
    const trace = await this.prisma.customerSipTrace.findFirst({
      where: { id: BigInt(id), customerId },
    });
    if (!trace) throw new NotFoundException('SIP trace not found');
    return trace;
  }

  private async findAny(id: string) {
    if (!/^\d+$/.test(id)) throw new NotFoundException('SIP trace not found');
    const trace = await this.prisma.customerSipTrace.findUnique({
      where: { id: BigInt(id) },
    });
    if (!trace) throw new NotFoundException('SIP trace not found');
    return trace;
  }

  private traceWindow(trace: {
    startedAt: Date;
    endedAt: Date | null;
    callIds: string[];
  }) {
    return {
      from: new Date(trace.startedAt.getTime() - 300_000).toISOString(),
      to: new Date(
        (trace.endedAt?.getTime() ?? Date.now()) + 300_000,
      ).toISOString(),
      callIds: trace.callIds.join(','),
    };
  }

  private snapshot(value: Prisma.JsonValue | null): SipMessage[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item) =>
        item !== null &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        'callId' in item &&
        'raw' in item,
    ) as unknown as SipMessage[];
  }

  private snapshotMatchesTrace(
    messages: SipMessage[],
    trace: { startedAt: Date; endedAt: Date | null },
  ) {
    if (!messages.length) return false;
    const timestamps = messages
      .map((message) => message.timestampMs)
      .filter(Number.isFinite);
    if (!timestamps.length) return false;
    const lowerBound = trace.startedAt.getTime() - 300_000;
    const upperBound = (trace.endedAt?.getTime() ?? Date.now()) + 300_000;
    return (
      Math.min(...timestamps) >= lowerBound &&
      Math.max(...timestamps) <= upperBound
    );
  }
}
