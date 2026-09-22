import { SupportAccess } from '../auth/decorators/support-access.decorator';
import { Body, Controller, Post } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CustomerId } from '../common/decorators/customer-id.decorator';
import { ResolveCallDto } from './dto/resolve-call.dto';
import { ResolveCustomerOutboundDto } from './dto/resolve-customer-outbound.dto';
import { RoutingService } from './routing.service';

@ApiTags('Call Routing Runtime')
@SupportAccess()
@Controller('routing')
export class RoutingController {
  constructor(
    private readonly routing: RoutingService,
  ) {}

  @Post('resolve')
  @Roles(Role.SUPER_ADMIN)
  resolve(@Body() dto: ResolveCallDto) {
    return this.routing.resolve(dto);
  }

  @Post('admin/rebuild-outbound')
  @Roles(Role.SUPER_ADMIN)
  rebuildOutboundRoutes() {
    return this.routing.rebuildOutboundRoutes();
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
