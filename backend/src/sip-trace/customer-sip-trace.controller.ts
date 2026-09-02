import { Controller, Get, Param } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CustomerId } from '../common/decorators/customer-id.decorator';
import { CustomerSipTraceService } from './customer-sip-trace.service';

@ApiTags('Customer SIP Trace')
@ApiSecurity('customer-context')
@Controller('sip-trace/customer')
export class CustomerSipTraceController {
  constructor(private readonly traces: CustomerSipTraceService) {}

  @Get('latest')
  latest(@CustomerId() customerId: string) {
    return this.traces.list(customerId);
  }

  @Get('calls/:id')
  detail(@CustomerId() customerId: string, @Param('id') id: string) {
    return this.traces.detail(customerId, id);
  }

  @Get('calls/:id/messages')
  messages(@CustomerId() customerId: string, @Param('id') id: string) {
    return this.traces.messages(customerId, id);
  }

  @Get('calls/:id/flow')
  flow(@CustomerId() customerId: string, @Param('id') id: string) {
    return this.traces.flow(customerId, id);
  }

  @Get('calls/:id/raw')
  raw(@CustomerId() customerId: string, @Param('id') id: string) {
    return this.traces.raw(customerId, id);
  }

  @Get('calls/:id/messages/:messageId/raw')
  rawMessage(
    @CustomerId() customerId: string,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
  ) {
    return this.traces.rawMessage(customerId, id, messageId);
  }

  @Get('calls/:id/logs')
  logs(@CustomerId() customerId: string, @Param('id') id: string) {
    return this.traces.logs(customerId, id);
  }

  @Get('calls/:id/rtcp')
  rtcp(@CustomerId() customerId: string, @Param('id') id: string) {
    return this.traces.rtcp(customerId, id);
  }
}
