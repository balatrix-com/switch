import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CustomerId } from '../common/decorators/customer-id.decorator';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerSettingsDto } from './dto/update-customer-settings.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@ApiTags('Customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list() {
    return this.customers.list();
  }

  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customers.create(dto);
  }

  @Get('current')
  @ApiSecurity('customer-context')
  findCurrent(@CustomerId() customerId: string) {
    return this.customers.findOne(customerId);
  }

  @Patch('current/settings')
  @ApiSecurity('customer-context')
  updateSettings(
    @CustomerId() customerId: string,
    @Body() dto: UpdateCustomerSettingsDto,
  ) {
    return this.customers.updateSettings(customerId, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customers.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(id, dto);
  }
}
