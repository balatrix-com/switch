import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CustomerId } from '../common/decorators/customer-id.decorator';
import { CustomerNumbersService } from './customer-numbers.service';
import { UpdateNumberSettingsDto } from './dto/update-number-settings.dto';
import { BulkUpdateNumberSettingsDto } from './dto/bulk-update-number-settings.dto';

@ApiTags('Customer Numbers')
@ApiSecurity('customer-context')
@Controller('customer-numbers')
export class CustomerNumbersController {
  constructor(private readonly numbers: CustomerNumbersService) {}

  @Get()
  list(@CustomerId() customerId: string) {
    return this.numbers.list(customerId);
  }

  @Get(':id')
  findOne(@CustomerId() customerId: string, @Param('id') id: string) {
    return this.numbers.findOne(customerId, id);
  }

  @Patch('bulk-settings')
  bulkUpdateSettings(
    @CustomerId() customerId: string,
    @Body() dto: BulkUpdateNumberSettingsDto,
  ) {
    return this.numbers.bulkUpdateSettings(customerId, dto);
  }

  @Patch(':id/settings')
  updateSettings(
    @CustomerId() customerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateNumberSettingsDto,
  ) {
    return this.numbers.updateSettings(customerId, id, dto);
  }
}
