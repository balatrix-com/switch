import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListCdrDto } from './dto/list-cdr.dto';

type CountRow = { count: bigint };

@Injectable()
export class CdrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async list(query: ListCdrDto) {
    const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (query.customerId)
      conditions.push(Prisma.sql`customer_id = ${query.customerId}`);
    if (query.direction)
      conditions.push(Prisma.sql`direction = ${query.direction}`);
    if (query.ratingStatus)
      conditions.push(Prisma.sql`rating_status = ${query.ratingStatus}`);
    if (query.from)
      conditions.push(Prisma.sql`started_at >= ${new Date(query.from)}`);
    if (query.to)
      conditions.push(Prisma.sql`started_at <= ${new Date(query.to)}`);
    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      conditions.push(
        Prisma.sql`(
          session_uuid ILIKE ${term}
          OR caller_number ILIKE ${term}
          OR destination_number ILIKE ${term}
          OR customer_id ILIKE ${term}
        )`,
      );
    }
    const where = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          id::text AS "id",
          session_uuid AS "sessionUuid",
          customer_id AS "customerId",
          direction,
          caller_number AS "callerNumber",
          destination_number AS "destinationNumber",
          carrier_id AS "carrierId",
          COALESCE(
            a_leg_sip_call_id,
            (SELECT event.a_leg_json #>> '{variables,sip_call_id}'
             FROM live_call_event AS event
             WHERE event.id = cdr.live_call_event_id)
          ) AS "aLegSipCallId",
          CASE WHEN cardinality(b_leg_sip_call_ids) > 0
            THEN b_leg_sip_call_ids
            ELSE COALESCE((
              SELECT ARRAY(
                SELECT DISTINCT leg #>> '{variables,sip_call_id}'
                FROM jsonb_array_elements(event.b_legs_json) AS leg
                WHERE leg #>> '{variables,sip_call_id}' IS NOT NULL
              )
              FROM live_call_event AS event
              WHERE event.id = cdr.live_call_event_id
            ), ARRAY[]::text[])
          END AS "bLegSipCallIds",
          homer_capture_id AS "homerCaptureId",
          route_id AS "routeId",
          started_at AS "startedAt",
          answered_at AS "answeredAt",
          ended_at AS "endedAt",
          duration_seconds AS "durationSeconds",
          billsec,
          carrier_billsec AS "carrierBillsec",
          answered,
          call_status AS "callStatus",
          hangup_cause AS "hangupCause",
          leg_count AS "legCount",
          rating_status AS "ratingStatus",
          rated_seconds AS "ratedSeconds",
          carrier_rated_seconds AS "carrierRatedSeconds",
          rate_card_id AS "rateCardId",
          carrier_rate_card_id AS "carrierRateCardId",
          carrier_rate_card_version AS "carrierRateCardVersion",
          currency,
          sell_rate_per_minute::text AS "sellRatePerMinute",
          carrier_rate_per_minute::text AS "carrierRatePerMinute",
          carrier_currency AS "carrierCurrency",
          customer_charge::text AS "customerCharge",
          carrier_cost::text AS "carrierCost",
          rating_error AS "ratingError",
          rated_at AS "ratedAt"
        FROM cdr
        ${where}
        ORDER BY started_at DESC NULLS LAST, id DESC
        LIMIT ${query.pageSize} OFFSET ${offset}
      `),
      this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count FROM cdr ${where}
      `),
    ]);
    const total = Number(countRows[0]?.count ?? 0n);
    return {
      data: rows,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        pages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async findOne(id: string) {
    if (!/^\d+$/.test(id)) {
      throw new BadRequestException('CDR id must be a positive integer');
    }
    const rows = await this.prisma.$queryRaw<
      Array<Record<string, unknown>>
    >(Prisma.sql`
      SELECT
        id::text AS "id",
        live_call_event_id::text AS "liveCallEventId",
        session_uuid AS "sessionUuid",
        switch_name AS "switchName",
        customer_id AS "customerId",
        direction,
        direction_source AS "directionSource",
        source_ip AS "sourceIp",
        source_port AS "sourcePort",
        caller_number AS "callerNumber",
        destination_number AS "destinationNumber",
        route_id AS "routeId",
        customer_number_id AS "customerNumberId",
        customer_endpoint_id AS "customerEndpointId",
        carrier_id AS "carrierId",
        carrier_endpoint_id AS "carrierEndpointId",
        COALESCE(
          a_leg_sip_call_id,
          (SELECT event.a_leg_json #>> '{variables,sip_call_id}'
           FROM live_call_event AS event
           WHERE event.id = cdr.live_call_event_id)
        ) AS "aLegSipCallId",
        CASE WHEN cardinality(b_leg_sip_call_ids) > 0
          THEN b_leg_sip_call_ids
          ELSE COALESCE((
            SELECT ARRAY(
              SELECT DISTINCT leg #>> '{variables,sip_call_id}'
              FROM jsonb_array_elements(event.b_legs_json) AS leg
              WHERE leg #>> '{variables,sip_call_id}' IS NOT NULL
            )
            FROM live_call_event AS event
            WHERE event.id = cdr.live_call_event_id
          ), ARRAY[]::text[])
        END AS "bLegSipCallIds",
        homer_capture_id AS "homerCaptureId",
        started_at AS "startedAt",
        answered_at AS "answeredAt",
        bridged_at AS "bridgedAt",
        ended_at AS "endedAt",
        duration_seconds AS "durationSeconds",
        billsec,
        carrier_billsec AS "carrierBillsec",
        answered,
        call_status AS "callStatus",
        hangup_cause AS "hangupCause",
        hangup_cause_q850 AS "hangupCauseQ850",
        sip_hangup_disposition AS "sipHangupDisposition",
        leg_count AS "legCount",
        rating_status AS "ratingStatus",
        rated_seconds AS "ratedSeconds",
        carrier_rated_seconds AS "carrierRatedSeconds",
        rate_card_id AS "rateCardId",
        carrier_rate_card_id AS "carrierRateCardId",
        carrier_rate_card_version AS "carrierRateCardVersion",
        customer_minimum_billing_id AS "customerMinimumBillingId",
        carrier_minimum_billing_id AS "carrierMinimumBillingId",
        customer_initial_increment_seconds AS "customerInitialIncrementSeconds",
        carrier_initial_increment_seconds AS "carrierInitialIncrementSeconds",
        customer_billing_increment_seconds AS "customerBillingIncrementSeconds",
        carrier_billing_increment_seconds AS "carrierBillingIncrementSeconds",
        currency,
        sell_rate_per_minute::text AS "sellRatePerMinute",
        carrier_rate_per_minute::text AS "carrierRatePerMinute",
        carrier_currency AS "carrierCurrency",
        customer_charge::text AS "customerCharge",
        carrier_cost::text AS "carrierCost",
        rating_attempts AS "ratingAttempts",
        rating_error AS "ratingError",
        rating_started_at AS "ratingStartedAt",
        rated_at AS "ratedAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM cdr WHERE id = ${BigInt(id)} LIMIT 1
    `);
    if (!rows[0]) throw new NotFoundException('CDR not found');
    return rows[0];
  }

  async createSipTraceLinks(id: string) {
    const cdr = await this.findOne(id);
    const baseUrl = this.config
      .get<string>('HOMER_API_BASE_URL')
      ?.replace(/\/$/, '');
    if (!baseUrl) {
      throw new ServiceUnavailableException(
        'HOMER_API_BASE_URL is not configured',
      );
    }

    const callIds = [
      typeof cdr.aLegSipCallId === 'string' && cdr.aLegSipCallId
        ? { leg: 'A', callId: cdr.aLegSipCallId }
        : null,
      ...(Array.isArray(cdr.bLegSipCallIds)
        ? cdr.bLegSipCallIds
            .filter(
              (callId): callId is string =>
                typeof callId === 'string' && Boolean(callId),
            )
            .map((callId, index) => ({ leg: `B${index + 1}`, callId }))
        : []),
    ].filter((item): item is { leg: string; callId: string } =>
      Boolean(item?.callId),
    );

    const uniqueCallIds = callIds.filter(
      (item, index) =>
        callIds.findIndex((candidate) => candidate.callId === item.callId) ===
        index,
    );
    if (!uniqueCallIds.length) {
      return {
        available: false,
        links: [],
        message: 'This CDR has no SIP Call-ID',
      };
    }

    const paddingMs =
      this.config.get<number>('HOMER_TRACE_WINDOW_SECONDS', 300) * 1000;
    const startedAt =
      cdr.startedAt instanceof Date
        ? cdr.startedAt.getTime()
        : Date.now() - 3_600_000;
    const endedAt =
      cdr.endedAt instanceof Date ? cdr.endedAt.getTime() : Date.now();
    const from = startedAt - paddingMs;
    const to = endedAt + paddingMs;
    const token = this.config.get<string>('HOMER_API_TOKEN');

    const dashboardLinks = () => ({
      available: true,
      mode: 'dashboard',
      links: uniqueCallIds.map(({ leg, callId }) => ({
        leg,
        callId,
        url: `${baseUrl}/?call_id=${encodeURIComponent(callId)}&from=${from}&to=${to}#dashboard`,
      })),
    });

    if (!token) {
      return dashboardLinks();
    }

    try {
      const links = await Promise.all(
        uniqueCallIds.map(async ({ leg, callId }) => {
          const response = await fetch(
            `${baseUrl}/api/v4/transactions/view/link`,
            {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'Auth-Token': token,
              },
              body: JSON.stringify({
                session_id: callId,
                proto_type: 1,
                event_type: 'call',
                timestamp: { from, to },
              }),
              signal: AbortSignal.timeout(10_000),
            },
          );
          const payload = (await response.json().catch(() => null)) as {
            data?: { url_view?: string };
            message?: string;
          } | null;
          if (!response.ok || !payload?.data?.url_view) {
            throw new Error(
              payload?.message || `Homer returned HTTP ${response.status}`,
            );
          }
          return {
            leg,
            callId,
            url: new URL(payload.data.url_view, `${baseUrl}/`).toString(),
          };
        }),
      );
      return { available: true, mode: 'standalone', links };
    } catch (error) {
      return {
        ...dashboardLinks(),
        warning: `Homer standalone link unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
      };
    }
  }
}
