import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SupportAccess } from '../auth/decorators/support-access.decorator';
import { Role } from '@prisma/client';
import { CustomerId } from '../common/decorators/customer-id.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerSettingsDto } from './dto/update-customer-settings.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { SendCredentialsDto } from './dto/send-credentials.dto';
import { SubscriptionClientService } from '../subscription/subscription-client.service';

@ApiTags('Customers')
@SupportAccess()
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly subscriptionClient: SubscriptionClientService,
  ) {}

  @Get()
  @Roles(Role.SUPER_ADMIN)
  list() {
    return this.customers.list();
  }

  @Post()
  @Roles(Role.SUPER_ADMIN)
  create(@Body() dto: CreateCustomerDto) {
    return this.customers.create(dto);
  }

  @Get('current')
  @ApiSecurity('customer-context')
  findCurrent(@CustomerId() customerId: string) {
    return this.customers.findOne(customerId);
  }

  @Get('me')
  findMe(@CustomerId() customerId: string) {
    return this.customers.findOne(customerId);
  }

  @Post(':id/send-credentials')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Send login credentials after customer onboarding is complete',
  })
  sendCredentials(
    @Param('id') id: string,
    @Body() dto: SendCredentialsDto,
  ) {
    return this.customers.sendCredentials(id, dto);
  }

  @Patch('current/settings')
  @ApiSecurity('customer-context')
  updateSettings(
    @CustomerId() customerId: string,
    @Body() dto: UpdateCustomerSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertCanAssignOutbound(user, dto);
    return this.customers.updateSettings(customerId, dto);
  }

  @Patch('me/settings')
  updateMySettings(
    @CustomerId() customerId: string,
    @Body() dto: UpdateCustomerSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertCanAssignOutbound(user, dto);
    return this.customers.updateSettings(customerId, dto);
  }

  @Get(':id/packages')
  @Roles(Role.SUPER_ADMIN, Role.CUSTOMER)
  @ApiOperation({ summary: 'Get active subscription packages for a customer' })
  getPackages(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.role === Role.CUSTOMER && user.customerId !== id)
      throw new ForbiddenException('You cannot access another customer’s packages');
    return this.subscriptionClient.getCustomerPackages(id);
  }

  @Get(':id/subscriptions')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all subscriptions for a customer' })
  getSubscriptions(@Param('id') id: string) {
    return this.subscriptionClient.getCustomerSubscriptions(id);
  }

  @Get(':id/renewal-logs')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get renewal audit history for a customer' })
  getRenewalLogs(@Param('id') id: string) {
    return this.subscriptionClient.getCustomerRenewalLogs(id);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN)
  findOne(@Param('id') id: string) {
    return this.customers.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Delete customer and clean up associated telecom routing and numbers',
  })
  remove(@Param('id') id: string) {
    return this.customers.remove(id);
  }

  private assertCanAssignOutbound(
    user: AuthenticatedUser,
    dto: UpdateCustomerSettingsDto,
  ) {
    if (
      user.role !== Role.SUPER_ADMIN &&
      (dto.defaultOutboundCarrierId !== undefined ||
        dto.defaultOutboundCarrierEndpointId !== undefined ||
        dto.recordingEnabled !== undefined ||
        dto.monthlyMinimumSpend !== undefined)
    ) {
      throw new ForbiddenException(
        'Only Super Admin can change outbound carrier, recording, or billing defaults',
      );
    }
  }
}
