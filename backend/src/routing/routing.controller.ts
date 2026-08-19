import { Body, Controller, Post } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CustomerId } from '../common/decorators/customer-id.decorator';
import { ResolveCallDto } from './dto/resolve-call.dto';
import { ResolveCustomerOutboundDto } from './dto/resolve-customer-outbound.dto';
import { RoutingService } from './routing.service';

@ApiTags('Call Routing Runtime')
@Controller('routing')
export class RoutingController {
  constructor(
    private readonly routing: RoutingService,
  ) {}

  @Post('resolve')
  resolve(@Body() dto: ResolveCallDto) {
    return this.routing.resolve(dto);
  }

  @Post('customer/outbound')
  @ApiSecurity('customer-context')
  resolveCustomerOutbound(
    @CustomerId() customerId: string,
    @Body() dto: ResolveCustomerOutboundDto,
  ) {
    return this.routing.resolveCustomerOutbound(customerId, dto);
  }

}
