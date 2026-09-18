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

@ApiTags('Customers')
@SupportAccess()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

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
        dto.defaultOutboundCarrierEndpointId !== undefined)
    ) {
      throw new ForbiddenException(
        'Only Super Admin can assign outbound routing to a customer',
      );
    }
  }
}
