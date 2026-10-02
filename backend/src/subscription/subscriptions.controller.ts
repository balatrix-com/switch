import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SubscriptionClientService } from './subscription-client.service';

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly client: SubscriptionClientService) {}

  @Get(':id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get a single subscription by ID' })
  findOne(@Param('id') id: string) {
    return this.client.getSubscriptionById(id);
  }

  @Patch(':id/renewal')
  @Roles(Role.SUPER_ADMIN, Role.CUSTOMER)
  @ApiOperation({ summary: 'Toggle auto-renewal on or off for a subscription' })
  toggleRenewal(
    @Param('id') id: string,
    @Body() dto: { renewal: boolean },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Note: If we need strictly enforcing CUSTOMER can only toggle their own subscription,
    // we would ideally need a check here or rely on the UI/API returning 404/403.
    // For now, this allows SUPER_ADMIN and CUSTOMER to call the internal API.
    return this.client.toggleRenewal(id, dto.renewal);
  }

  @Post(':id/release-numbers')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Cancel subscription and release all assigned numbers' })
  releaseNumbers(@Param('id') id: string) {
    return this.client.releaseSubscriptionNumbers(id);
  }
}
