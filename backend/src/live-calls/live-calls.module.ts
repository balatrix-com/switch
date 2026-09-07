import { Module } from '@nestjs/common';
import { LiveCallsController } from './live-calls.controller';
import { LiveCallsService } from './live-calls.service';

@Module({
  controllers: [LiveCallsController],
  providers: [LiveCallsService],
})
export class LiveCallsModule {}
