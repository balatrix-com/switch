import { SupportAccess } from '../auth/decorators/support-access.decorator';
import { Controller, ForbiddenException, Get, Param } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CustomerId } from '../common/decorators/customer-id.decorator';
import { CustomerSipTraceService } from './customer-sip-trace.service';

@ApiTags('Customer SIP Trace')
@ApiSecurity('customer-context')
@SupportAccess()
@Controller('sip-trace/customer')
export class CustomerSipTraceController {
  constructor(private readonly traces: CustomerSipTraceService) {}

  @Get('latest')
  latest(@CustomerId() customerId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.traces.list(customerId, user.role === Role.CUSTOMER);
  }

  @Get('calls/:id')
  detail(@CustomerId() customerId: string, @Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.traces.detail(customerId, id, user.role === Role.CUSTOMER);
  }

  @Get('calls/:id/messages')
  messages(@CustomerId() customerId: string, @Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.traces.messages(customerId, id, user.role === Role.CUSTOMER);
  }

  @Get('calls/:id/flow')
  flow(@CustomerId() customerId: string, @Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.traces.flow(customerId, id, user.role === Role.CUSTOMER);
  }

  @Get('calls/:id/raw')
  raw(@CustomerId() customerId: string, @Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.traces.raw(customerId, id, user.role === Role.CUSTOMER);
  }

  @Get('calls/:id/messages/:messageId/raw')
  rawMessage(
    @CustomerId() customerId: string,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.traces.rawMessage(customerId, id, messageId, user.role === Role.CUSTOMER);
  }

  @Get('calls/:id/logs')
  logs(@CustomerId() customerId: string, @Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.role === Role.CUSTOMER) throw new ForbiddenException('Not available in tenant SIP trace');
    return this.traces.logs(customerId, id);
  }

  @Get('calls/:id/rtcp')
  rtcp(@CustomerId() customerId: string, @Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.role === Role.CUSTOMER) throw new ForbiddenException('Not available in tenant SIP trace');
    return this.traces.rtcp(customerId, id);
  }
}
