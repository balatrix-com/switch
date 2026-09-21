import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PlansService } from './plans.service';
import { CreatePlanDto, QueryPlansDto, UpdatePlanDto } from './dto/plan.dto';
import { SubscribePlanDto } from './dto/subscribe-plan.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @ApiOperation({
    summary: 'List all plans with optional filtering by status and category',
  })
  list(@Query() query: QueryPlansDto) {
    return this.plansService.list(query);
  }

  @Post('subscribe')
  @Roles(Role.SUPER_ADMIN, Role.CUSTOMER)
  @ApiOperation({ summary: 'Subscribe a customer to an active plan' })
  subscribe(
    @Body() dto: SubscribePlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.role !== Role.SUPER_ADMIN) {
      if (!user.customerId || dto.customer_id !== user.customerId)
        throw new ForbiddenException('You cannot subscribe another customer');
      if (dto.override_balance_check === true)
        throw new ForbiddenException(
          'Only Super Admin can override the wallet balance check',
        );
      return this.plansService.subscribe({
        ...dto,
        customer_id: user.customerId,
        override_balance_check: false,
      });
    }
    return this.plansService.subscribe(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific plan by ID' })
  findOne(@Param('id') id: string) {
    return this.plansService.findOne(id);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new Asset or Minutes plan' })
  create(@Body() dto: CreatePlanDto) {
    return this.plansService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update plan configuration or toggle status' })
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plansService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete or decommission a plan' })
  remove(@Param('id') id: string) {
    return this.plansService.remove(id);
  }
}
