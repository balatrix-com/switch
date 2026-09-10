import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { LiveCallsController } from './live-calls.controller';
import { LIVE_CALLS_REDIS } from './live-calls.constants';
import { LiveCallsService } from './live-calls.service';

@Module({
  controllers: [LiveCallsController],
  providers: [
    {
      provide: LIVE_CALLS_REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('LiveCallsRedis');
        const url = config.get<string>('REDIS_URL', 'redis://127.0.0.1:6379/0');
        const client = new Redis(url, {
          maxRetriesPerRequest: 1,
          lazyConnect: false,
          retryStrategy: (times) => Math.min(times * 500, 5000),
        });
        client.on('error', (err) => {
          logger.warn(`Redis connection error: ${err.message}`);
        });
        client.on('connect', () => {
          logger.log('Connected to Redis server');
        });
        return client;
      },
    },
    LiveCallsService,
  ],
})
export class LiveCallsModule {}
