import { SupportAccess } from '../auth/decorators/support-access.decorator';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CdrService } from './cdr.service';
import { ListCdrDto } from './dto/list-cdr.dto';
import { CustomerId } from '../common/decorators/customer-id.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Role } from '@prisma/client';

@ApiTags('CDR')
@SupportAccess()
@Controller('cdrs')
export class CdrController {
  constructor(private readonly cdr: CdrService) {}

  @Get()
  list(
    @Query() query: ListCdrDto,
    @CustomerId({ required: false }) customerId?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (customerId) query.customerId = customerId;
    return this.cdr.list(query, user?.role !== Role.SUPER_ADMIN);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CustomerId({ required: false }) customerId?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.cdr.findOne(id, customerId, user?.role !== Role.SUPER_ADMIN);
  }
}
