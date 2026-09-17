import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListCdrDto } from './dto/list-cdr.dto';

type CountRow = { count: bigint };

const VENDOR_FIELDS = new Set([
  'carrierId',
  'carrierBillsec',
  'carrierRatedSeconds',
  'carrierRateCardId',
  'carrierRateCardVersion',
  'carrierCurrency',
  'carrierRatePerMinute',
  'carrierCost',
  'carrierMinimumBillingId',
  'carrierInitialIncrementSeconds',
  'carrierBillingIncrementSeconds',
]);

function tenantVisible(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !VENDOR_FIELDS.has(key)),
  );
}

@Injectable()
export class CdrService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCdrDto, hideVendor = false) {
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
          COALESCE((
            SELECT settings.recording_enabled
            FROM customer_settings AS settings
            WHERE settings.customer_id = cdr.customer_id
          ), FALSE) AS "recordingEnabled",
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
      data: hideVendor ? rows.map(tenantVisible) : rows,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        pages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async findOne(id: string, customerId?: string, hideVendor = false) {
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
        COALESCE((
          SELECT settings.recording_enabled
          FROM customer_settings AS settings
          WHERE settings.customer_id = cdr.customer_id
        ), FALSE) AS "recordingEnabled",
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
      FROM cdr
      WHERE cdr.id = ${BigInt(id)}
        AND (${customerId ?? null}::text IS NULL OR cdr.customer_id = ${customerId ?? null})
      LIMIT 1
    `);
    if (!rows[0]) throw new NotFoundException('CDR not found');
    return hideVendor ? tenantVisible(rows[0]) : rows[0];
  }
}
