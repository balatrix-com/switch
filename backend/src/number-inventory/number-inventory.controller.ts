import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NumberInventoryStatus } from '@prisma/client';
import { AssignNumberDto } from './dto/assign-number.dto';
import { CreateInventoryNumberDto } from './dto/create-inventory-number.dto';
import { NumberInventoryService } from './number-inventory.service';

@ApiTags('Global Number Inventory')
@Controller('number-inventory')
export class NumberInventoryController {
  constructor(private readonly inventory: NumberInventoryService) {}

  @Get()
  list(@Query('status') status?: NumberInventoryStatus) {
    return this.inventory.list(status);
  }
  @Post()
  create(@Body() dto: CreateInventoryNumberDto) {
    return this.inventory.create(dto);
  }
  @Post(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignNumberDto) {
    return this.inventory.assign(id, dto);
  }
  @Delete(':id/assignment')
  unassign(@Param('id') id: string) {
    return this.inventory.unassign(id);
  }
}
