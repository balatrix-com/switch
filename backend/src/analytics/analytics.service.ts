import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

type AggregateRow = {
  total: bigint; answered: bigint; unanswered: bigint; busy: bigint; failed: bigint;
  billsec: bigint; revenue: Prisma.Decimal | null; carrierCost: Prisma.Decimal | null;
  foreignCostCalls: bigint;
};
type GroupRow = AggregateRow & { key: string; name: string | null; currency?: string };
type SeriesRow = { day: string; total: bigint; answered: bigint };
type MoneyRow = { currency: string; revenue: Prisma.Decimal | null; carrierCost: Prisma.Decimal | null; foreignCostCalls: bigint };

const aggregate = Prisma.sql`
  COUNT(*)::bigint AS total,
  COUNT(*) FILTER (WHERE cdr.answered)::bigint AS answered,
  COUNT(*) FILTER (WHERE NOT cdr.answered AND cdr.call_status IN ('NO_ANSWER', 'NO_USER_RESPONSE'))::bigint AS unanswered,
  COUNT(*) FILTER (WHERE NOT cdr.answered AND cdr.call_status = 'BUSY')::bigint AS busy,
  COUNT(*) FILTER (WHERE NOT cdr.answered AND cdr.call_status NOT IN ('NO_ANSWER', 'NO_USER_RESPONSE', 'BUSY'))::bigint AS failed,
  COALESCE(SUM(GREATEST(cdr.billsec, 0)), 0)::bigint AS billsec,
  COALESCE(SUM(cdr.customer_charge), 0) AS "revenue",
  COALESCE(SUM(cdr.carrier_cost) FILTER (WHERE cdr.carrier_currency IS NULL OR cdr.carrier_currency = cdr.currency), 0) AS "carrierCost",
  COUNT(*) FILTER (WHERE cdr.carrier_cost IS NOT NULL AND cdr.carrier_cost <> 0 AND cdr.carrier_currency IS NOT NULL AND cdr.carrier_currency <> cdr.currency)::bigint AS "foreignCostCalls"
`;

function shape(row: AggregateRow) {
  const total = Number(row.total);
  const answered = Number(row.answered);
  const billsec = Number(row.billsec);
  const revenue = Number(row.revenue ?? 0);
  const carrierCost = Number(row.carrierCost ?? 0);
  return {
    total, answered, unanswered: Number(row.unanswered), busy: Number(row.busy), failed: Number(row.failed),
    asr: total ? answered / total * 100 : 0,
    acdSeconds: answered ? billsec / answered : 0,
    billsec, minutes: billsec / 60,
    revenue, carrierCost, margin: Number(row.foreignCostCalls) ? null : revenue - carrierCost,
    foreignCostCalls: Number(row.foreignCostCalls),
  };
}

function withoutVendor<T extends { carrierCost: number; margin: number | null; foreignCostCalls: number }>(row: T) {
  const { carrierCost: _carrierCost, margin: _margin, foreignCostCalls: _foreignCostCalls, ...visible } = row;
  return visible;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(query: AnalyticsQueryDto, customerId?: string | null, includeVendor = true) {
    const now = new Date();
    const from = query.from ? new Date(query.from) : new Date(now.getTime() - 7 * 86_400_000);
    const to = query.to ? new Date(query.to) : now;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to || to.getTime() - from.getTime() > 366 * 86_400_000)
      throw new BadRequestException('Choose a valid range of at most 366 days, with from before to');

    const conditions: Prisma.Sql[] = [Prisma.sql`cdr.started_at >= ${from}`, Prisma.sql`cdr.started_at < ${to}`];
    if (customerId) conditions.push(Prisma.sql`cdr.customer_id = ${customerId}`);
    const where = Prisma.sql`WHERE ${Prisma.join(query.direction ? [...conditions, Prisma.sql`cdr.direction = ${query.direction}`] : conditions, ' AND ')}`;
    // DID ranking is inbound-only even when the headline filter is outbound.
    const didWhere = Prisma.sql`WHERE ${Prisma.join([...conditions, Prisma.sql`cdr.direction = 'INBOUND'`], ' AND ')}`;

    const [summaryRows, seriesRows, didRows, tenantRows, carrierRows, moneyRows] = await Promise.all([
      this.prisma.$queryRaw<AggregateRow[]>(Prisma.sql`SELECT ${aggregate} FROM cdr ${where}`),
      this.prisma.$queryRaw<SeriesRow[]>(Prisma.sql`
        SELECT to_char(cdr.started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
          COUNT(*)::bigint AS total, COUNT(*) FILTER (WHERE cdr.answered)::bigint AS answered
        FROM cdr ${where} GROUP BY 1 ORDER BY 1
      `),
      this.prisma.$queryRaw<GroupRow[]>(Prisma.sql`
        SELECT COALESCE(inventory.canonical_number, NULLIF(cdr.destination_number, ''), 'Unknown') AS key,
          COALESCE(inventory.canonical_number, NULLIF(cdr.destination_number, ''), 'Unknown') AS name,
          ${aggregate}
        FROM cdr
        LEFT JOIN customer_numbers AS number ON number.id = cdr.customer_number_id AND number.customer_id = cdr.customer_id
        LEFT JOIN global_number_inventory AS inventory ON inventory.id = number.inventory_id
        ${didWhere}
        GROUP BY 1 ORDER BY total DESC, key ASC
      `),
      customerId ? Promise.resolve([] as GroupRow[]) : this.prisma.$queryRaw<GroupRow[]>(Prisma.sql`
        SELECT cdr.customer_id AS key, COALESCE(customer.name, cdr.customer_id) AS name, cdr.currency, ${aggregate}
        FROM cdr LEFT JOIN customers AS customer ON customer.id = cdr.customer_id
        ${where} GROUP BY cdr.customer_id, customer.name, cdr.currency ORDER BY total DESC, key ASC
      `),
      customerId ? Promise.resolve([] as GroupRow[]) : this.prisma.$queryRaw<GroupRow[]>(Prisma.sql`
        SELECT COALESCE(cdr.carrier_id, 'unknown') AS key, COALESCE(carrier.name, 'Unmapped carrier') AS name, cdr.currency, ${aggregate}
        FROM cdr LEFT JOIN carriers AS carrier ON carrier.id = cdr.carrier_id
        ${where} GROUP BY cdr.carrier_id, carrier.name, cdr.currency ORDER BY total DESC, key ASC
      `),
      this.prisma.$queryRaw<MoneyRow[]>(Prisma.sql`
        SELECT cdr.currency AS currency, COALESCE(SUM(cdr.customer_charge), 0) AS revenue,
          COALESCE(SUM(cdr.carrier_cost) FILTER (WHERE cdr.carrier_currency IS NULL OR cdr.carrier_currency = cdr.currency), 0) AS "carrierCost",
          COUNT(*) FILTER (WHERE cdr.carrier_cost IS NOT NULL AND cdr.carrier_cost <> 0 AND cdr.carrier_currency IS NOT NULL AND cdr.carrier_currency <> cdr.currency)::bigint AS "foreignCostCalls"
        FROM cdr ${where} GROUP BY cdr.currency ORDER BY cdr.currency
      `),
    ]);
    const money = moneyRows.map((row) => ({
      currency: row.currency, revenue: Number(row.revenue ?? 0), carrierCost: Number(row.carrierCost ?? 0),
      margin: Number(row.foreignCostCalls) ? null : Number(row.revenue ?? 0) - Number(row.carrierCost ?? 0),
      foreignCostCalls: Number(row.foreignCostCalls),
    }));
    const dayCounts = new Map(seriesRows.map((row) => [row.day, { total: Number(row.total), answered: Number(row.answered) }]));
    const series: Array<{ day: string; total: number; answered: number }> = [];
    const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    while (cursor < to) {
      const day = cursor.toISOString().slice(0, 10);
      series.push({ day, ...(dayCounts.get(day) ?? { total: 0, answered: 0 }) });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    const result = {
      range: { from: from.toISOString(), to: to.toISOString(), direction: query.direction ?? 'ALL' },
      summary: shape(summaryRows[0] ?? { total: 0n, answered: 0n, unanswered: 0n, busy: 0n, failed: 0n, billsec: 0n, revenue: null, carrierCost: null, foreignCostCalls: 0n }),
      money,
      series,
      dids: didRows.map((row) => ({ key: row.key, name: row.name, ...shape(row) })),
      tenants: tenantRows.map((row) => ({ key: row.key, name: row.name, currency: row.currency, ...shape(row) })),
      carriers: carrierRows.map((row) => ({ key: row.key, name: row.name, currency: row.currency, ...shape(row) })),
    };
    return includeVendor ? result : {
      ...result,
      summary: withoutVendor(result.summary),
      money: result.money.map(withoutVendor),
      dids: result.dids.map(withoutVendor),
      tenants: [],
      carriers: [],
    };
  }
}
