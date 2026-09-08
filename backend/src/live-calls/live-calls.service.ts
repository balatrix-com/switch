import {
  BadGatewayException,
  Inject,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { LIVE_CALLS_REDIS } from './live-calls.constants';

type LiveCall = {
  uuid: string;
  bUuid?: string | null;
  direction?: string | null;
  accountcode?: string | null;
  destinationNumber?: string | null;
  remoteIp?: string | null;
  [key: string]: unknown;
};

type LiveCallsResponse = {
  ok: boolean;
  calls: LiveCall[];
  summary: Record<string, number>;
  polledAt: number;
};

const EMPTY_RESPONSE: LiveCallsResponse = {
  ok: true,
  calls: [],
  summary: {
    activeCalls: 0,
    activeChannels: 0,
    inbound: 0,
    outbound: 0,
    activeTenants: 0,
  },
  polledAt: 0,
};

@Injectable()
export class LiveCallsService implements OnModuleDestroy {
  constructor(
    @Inject(LIVE_CALLS_REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleDestroy() {
    this.redis.disconnect();
  }

  async list(customerId?: string): Promise<LiveCallsResponse> {
    let raw: string | null;
    try {
      await this.redis.set('livecalls:wake', Date.now().toString(), 'EX', 600);
      raw = await this.redis.get('livecalls:data');
    } catch (error) {
      throw new BadGatewayException(
        `Live call cache unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    const payload = raw ? this.parsePayload(raw) : EMPTY_RESPONSE;
    const calls = customerId
      ? await this.filterForCustomer(payload.calls, customerId)
      : payload.calls;
    const enriched = await this.enrich(calls);
    return {
      ...payload,
      calls: enriched,
      summary: this.summary(
        enriched,
        customerId ? undefined : payload.summary.activeChannels,
      ),
    };
  }

  private parsePayload(raw: string): LiveCallsResponse {
    try {
      const payload = JSON.parse(raw) as LiveCallsResponse;
      if (!Array.isArray(payload.calls))
        throw new Error('calls is not an array');
      return payload;
    } catch (error) {
      throw new BadGatewayException(
        `Live call cache contains invalid data: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private async filterForCustomer(calls: LiveCall[], customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { OR: [{ id: customerId }, { accountCode: customerId }] },
      select: {
        id: true,
        accountCode: true,
        numbers: {
          select: { inventory: { select: { canonicalNumber: true } } },
        },
      },
    });
    if (!customer) return [];
    const numbers = new Set(
      customer.numbers.map((item) => item.inventory.canonicalNumber),
    );
    return calls.filter(
      (call) =>
        call.accountcode === customer.id ||
        call.accountcode === customer.accountCode ||
        (call.destinationNumber && numbers.has(call.destinationNumber)),
    );
  }

  private async enrich(calls: LiveCall[]) {
    const customerKeys = [
      ...new Set(
        calls
          .map((call) => call.accountcode)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const remoteIps = [
      ...new Set(
        calls
          .map((call) => call.remoteIp)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const [customers, endpoints] = await Promise.all([
      this.prisma.customer.findMany({
        where: {
          OR: [
            { id: { in: customerKeys } },
            { accountCode: { in: customerKeys } },
          ],
        },
        select: { id: true, accountCode: true, name: true },
      }),
      this.prisma.carrierEndpoint.findMany({
        where: { host: { in: remoteIps } },
        select: { host: true, carrier: { select: { id: true, name: true } } },
      }),
    ]);
    return calls.map((call) => {
      const customer = customers.find(
        (item) =>
          item.id === call.accountcode || item.accountCode === call.accountcode,
      );
      const endpoint = endpoints.find((item) => item.host === call.remoteIp);
      return {
        ...call,
        customer: customer ?? null,
        carrier: endpoint?.carrier ?? null,
        carrierIp: endpoint?.host ?? call.remoteIp ?? null,
      };
    });
  }

  private summary(calls: LiveCall[], activeChannels?: number) {
    const directions = calls.map((call) =>
      String(call.direction ?? '').toLowerCase(),
    );
    return {
      activeCalls: calls.length,
      activeChannels:
        activeChannels ??
        new Set(
          calls.flatMap((call) => [call.uuid, call.bUuid]).filter(Boolean),
        ).size,
      inbound: directions.filter((value) => value === 'inbound').length,
      outbound: directions.filter((value) => value === 'outbound').length,
      activeTenants: new Set(
        calls.map((call) => call.accountcode).filter(Boolean),
      ).size,
    };
  }
}
