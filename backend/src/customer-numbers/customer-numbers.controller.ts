import { SupportAccess } from '../auth/decorators/support-access.decorator';
import { Body, Controller, ForbiddenException, Get, Param, Patch } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CustomerId } from '../common/decorators/customer-id.decorator';
import { CustomerNumbersService } from './customer-numbers.service';
import { UpdateNumberSettingsDto } from './dto/update-number-settings.dto';
import { BulkUpdateNumberSettingsDto } from './dto/bulk-update-number-settings.dto';

@ApiTags('Customer Numbers')
@ApiSecurity('customer-context')
@SupportAccess()
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
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (dto.settings.providerRateCardId !== undefined && user.role !== Role.SUPER_ADMIN)
      throw new ForbiddenException('Only a Superadmin may assign a DID rate card');
    return this.numbers.bulkUpdateSettings(customerId, dto);
  }

  @Patch(':id/settings')
  updateSettings(
    @CustomerId() customerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateNumberSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (dto.providerRateCardId !== undefined && user.role !== Role.SUPER_ADMIN)
      throw new ForbiddenException('Only a Superadmin may assign a DID rate card');
    return this.numbers.updateSettings(customerId, id, dto);
  }
}
