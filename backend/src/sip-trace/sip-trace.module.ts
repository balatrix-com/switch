import { Module } from '@nestjs/common';
import { CustomerSipTraceController } from './customer-sip-trace.controller';
import { CustomerSipTraceService } from './customer-sip-trace.service';
import { SipTraceController } from './sip-trace.controller';
import { SipTraceService } from './sip-trace.service';

@Module({
  controllers: [SipTraceController, CustomerSipTraceController],
  providers: [SipTraceService, CustomerSipTraceService],
})
export class SipTraceModule {}
