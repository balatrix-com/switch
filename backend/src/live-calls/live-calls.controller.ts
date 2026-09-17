import { SupportAccess } from '../auth/decorators/support-access.decorator';
import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CustomerId } from '../common/decorators/customer-id.decorator';
import { LiveCallsService } from './live-calls.service';

@ApiTags('Live Calls')
@SupportAccess()
@Controller('live-calls')
export class LiveCallsController {
  constructor(private readonly liveCalls: LiveCallsService) {}

  @Get()
  list(@CustomerId({ required: false }) customerId?: string) {
    return this.liveCalls.list(customerId);
  }

  @Post(':uuid/listen')
  listen(@CustomerId() customerId: string, @Param('uuid') uuid: string) {
    return this.liveCalls.listen(customerId, uuid);
  }
}
