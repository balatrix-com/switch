import {
  BadGatewayException,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SourceType } from '@prisma/client';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Pool, PoolClient } from 'pg';

export type KamailioSource = {
  id: string;
  sourceType: SourceType;
  ipAddress: string;
  port: number;
  isActive: boolean;
};

export type KamailioSubscriber = {
  username: string;
  realm: string;
  ha1: string;
  isActive: boolean;
};

@Injectable()
export class KamailioDbService implements OnModuleDestroy {
  private readonly logger = new Logger(KamailioDbService.name);
  private readonly databaseUrl?: string;
  private readonly rpcUrl?: string;
  private readonly enabled: boolean;
  private readonly rpcTimeoutMs: number;
  private pool?: Pool;

  constructor(config: ConfigService) {
    this.databaseUrl = config.get<string>('KAMAILIO_DATABASE_URL');
    this.rpcUrl = config.get<string>('KAMAILIO_RPC_URL');
    this.enabled =
      config
        .get<string>(
          'KAMAILIO_SYNC_ENABLED',
          this.databaseUrl ? 'true' : 'false',
        )
        .toLowerCase() === 'true';
    this.rpcTimeoutMs = Number(
      config.get<string>('KAMAILIO_RPC_TIMEOUT_MS', '5000'),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  groupFor(sourceType: SourceType): number {
    return sourceType === SourceType.CARRIER ? 1 : 2;
  }

  async upsertSource(source: KamailioSource): Promise<void> {
    await this.upsertSources([source]);
  }

  async upsertSources(sources: KamailioSource[]): Promise<void> {
    if (!sources.length) return;
    if (!this.enabled) return;
    await this.run(async (client) => {
      for (const source of sources) {
        await client.query('DELETE FROM address WHERE tag = $1', [
          this.tag(source.id),
        ]);
        if (source.isActive) await this.insertSource(client, source);
      }
    });
    await this.reload();
  }

  async removeSource(sourceId: string): Promise<void> {
    if (!this.enabled) return;
    await this.run((client) =>
      client.query('DELETE FROM address WHERE tag = $1', [this.tag(sourceId)]),
    );
    await this.reload();
  }

  async removeSources(sourceIds: string[]): Promise<void> {
    if (!this.enabled || !sourceIds.length) return;
    await this.run((client) =>
      client.query('DELETE FROM address WHERE tag = ANY($1::text[])', [
        sourceIds.map((id) => this.tag(id)),
      ]),
    );
    await this.reload();
  }

  async upsertSubscriber(subscriber: KamailioSubscriber): Promise<void> {
    if (!this.enabled) return;
    await this.run(async (client) => {
      await client.query(
        'DELETE FROM subscriber WHERE username = $1 AND domain = $2',
        [subscriber.username, subscriber.realm],
      );
      if (subscriber.isActive) {
        await client.query(
          `INSERT INTO subscriber (username, domain, password, ha1, ha1b)
           VALUES ($1, $2, '', $3, $4)`,
          [
            subscriber.username,
            subscriber.realm,
            subscriber.ha1,
            subscriber.ha1,
          ],
        );
      }
    }, 'update the Kamailio subscriber table');
  }

  async removeSubscriber(username: string, realm: string): Promise<void> {
    if (!this.enabled) return;
    await this.run(
      (client) =>
        client.query(
          'DELETE FROM subscriber WHERE username = $1 AND domain = $2',
          [username, realm],
        ),
      'update the Kamailio subscriber table',
    );
  }

  async registeredUsers(
    usernames: string[],
    realm: string,
  ): Promise<Set<string>> {
    if (!this.enabled || !usernames.length) return new Set();
    const rows = await this.run(
      (client) =>
        client.query<{ username: string }>(
          `SELECT DISTINCT username FROM location
         WHERE username = ANY($1::text[]) AND (domain = $2 OR domain IS NULL) AND expires > CURRENT_TIMESTAMP`,
          [usernames, realm],
        ),
      'read the Kamailio location table',
    );
    return new Set(rows.rows.map((row) => row.username));
  }

  async replaceManagedSources(sources: KamailioSource[]): Promise<number> {
    if (!this.enabled) return 0;
    await this.run(async (client) => {
      await client.query(
        "DELETE FROM address WHERE tag LIKE 'billing-switch:%'",
      );
      for (const source of sources) {
        if (source.isActive) await this.insertSource(client, source);
      }
    });
    await this.reload();
    return sources.filter((source) => source.isActive).length;
  }

  private getPool(): Pool {
    if (!this.databaseUrl) {
      throw new BadGatewayException(
        'KAMAILIO_DATABASE_URL is required when Kamailio synchronization is enabled',
      );
    }
    this.pool ??= new Pool({ connectionString: this.databaseUrl, max: 2 });
    return this.pool;
  }

  private async run<T>(
    operation: (client: PoolClient) => Promise<T>,
    action = 'update the Kamailio address table',
  ): Promise<T> {
    const client = await this.getPool()
      .connect()
      .catch((error: unknown) => {
        throw this.failure('connect to the Kamailio database', error);
      });
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw this.failure(action, error);
    } finally {
      client.release();
    }
  }

  private async insertSource(
    client: PoolClient,
    source: KamailioSource,
  ): Promise<void> {
    const addresses = await this.resolveAddresses(source.ipAddress);
    for (const address of addresses) {
      await client.query(
        `INSERT INTO address (grp, ip_addr, mask, port, tag)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          this.groupFor(source.sourceType),
          address,
          isIP(address) === 6 ? 128 : 32,
          source.port || 0,
          this.tag(source.id),
        ],
      );
    }
  }

  private async resolveAddresses(host: string): Promise<string[]> {
    if (isIP(host)) return [host];
    const results = await lookup(host, { all: true });
    const addresses = [...new Set(results.map((result) => result.address))];
    if (!addresses.length)
      throw new Error(`No IP address resolved for ${host}`);
    return addresses;
  }

  private async reload(): Promise<void> {
    if (!this.rpcUrl) {
      throw new BadGatewayException(
        'KAMAILIO_RPC_URL is required when Kamailio synchronization is enabled',
      );
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.rpcTimeoutMs);
    try {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'permissions.addressReload',
          id: Date.now(),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      const result = (await response.json()) as { error?: unknown };
      if (result.error) throw new Error(JSON.stringify(result.error));
      this.logger.log('Kamailio permissions address cache reloaded');
    } catch (error) {
      throw this.failure('reload Kamailio permissions', error);
    } finally {
      clearTimeout(timeout);
    }
  }

  private tag(id: string): string {
    return `billing-switch:${id}`;
  }

  private failure(action: string, error: unknown): BadGatewayException {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`Unable to ${action}: ${message}`);
    return new BadGatewayException(`Unable to ${action}: ${message}`);
  }
}
