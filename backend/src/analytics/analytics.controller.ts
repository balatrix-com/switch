import { Controller, Get, Query, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN, Role.CUSTOMER)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  get(@Query() query: AnalyticsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    if (user.role === Role.CUSTOMER && !user.customerId)
      throw new ForbiddenException('Customer account is not available');
    if (user.role === Role.CUSTOMER && query.customerId && query.customerId !== user.customerId)
      throw new ForbiddenException('You cannot access another customer’s analytics');
    return this.analytics.get(query, user.role === Role.CUSTOMER ? user.customerId! : query.customerId, user.role === Role.SUPER_ADMIN);
  }
}
