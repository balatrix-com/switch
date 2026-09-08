import { Module } from '@nestjs/common';
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
      useFactory: (config: ConfigService) =>
        new Redis(config.get<string>('REDIS_URL', 'redis://127.0.0.1:6379/0'), {
          maxRetriesPerRequest: 1,
        }),
    },
    LiveCallsService,
  ],
})
export class LiveCallsModule {}
