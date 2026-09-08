import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CustomerId } from '../common/decorators/customer-id.decorator';
import { LiveCallsService } from './live-calls.service';

@ApiTags('Live Calls')
@Controller('live-calls')
export class LiveCallsController {
  constructor(private readonly liveCalls: LiveCallsService) {}

  @Get()
  list(@CustomerId({ required: false }) customerId?: string) {
    return this.liveCalls.list(customerId);
  }
}
