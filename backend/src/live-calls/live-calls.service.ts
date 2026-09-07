import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

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

@Injectable()
export class LiveCallsService {
  private readonly serviceUrl: string;
  private readonly token: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.serviceUrl = config
      .get<string>('XML_CURL_SERVICE_URL', 'http://127.0.0.1:8000')
      .replace(/\/$/, '');
    this.token = config.get<string>('XML_CURL_CACHE_TOKEN', 'change-me');
  }

  async list(customerId?: string): Promise<LiveCallsResponse> {
    const payload = await this.request<LiveCallsResponse>('/live/calls');
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

  async kill(uuid: string, customerId?: string) {
    if (customerId) {
      const visible = await this.list(customerId);
      if (
        !visible.calls.some((call) => call.uuid === uuid || call.bUuid === uuid)
      ) {
        throw new ForbiddenException(
          'Live channel does not belong to this customer',
        );
      }
    }
    return this.request(`/live/channels/${encodeURIComponent(uuid)}/kill`, {
      method: 'POST',
      headers: { 'X-Cache-Token': this.token },
    });
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

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    try {
      const response = await fetch(`${this.serviceUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(5_000),
      });
      const payload = (await response.json()) as T & { error?: string };
      if (!response.ok)
        throw new Error(payload.error || `HTTP ${response.status}`);
      return payload;
    } catch (error) {
      throw new BadGatewayException(
        `Live call service unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
