import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlansService } from './plans.service';
import { CreatePlanDto, QueryPlansDto, UpdatePlanDto } from './dto/plan.dto';
import { SubscribePlanDto } from './dto/subscribe-plan.dto';

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @ApiOperation({ summary: 'List all plans with optional filtering by status and category' })
  list(@Query() query: QueryPlansDto) {
    return this.plansService.list(query);
  }

  @Post('subscribe')
  @ApiOperation({ summary: 'Subscribe a customer to an active plan' })
  subscribe(@Body() dto: SubscribePlanDto) {
    return this.plansService.subscribe(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific plan by ID' })
  findOne(@Param('id') id: string) {
    return this.plansService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new Asset or Minutes plan' })
  create(@Body() dto: CreatePlanDto) {
    return this.plansService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update plan configuration or toggle status' })
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plansService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete or decommission a plan' })
  remove(@Param('id') id: string) {
    return this.plansService.remove(id);
  }
}
