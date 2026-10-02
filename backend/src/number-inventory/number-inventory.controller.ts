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
import { ApiTags } from '@nestjs/swagger';
import { NumberInventoryStatus, Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AssignNumberDto } from './dto/assign-number.dto';
import { CreateInventoryNumberDto } from './dto/create-inventory-number.dto';
import { NumberInventoryService } from './number-inventory.service';
import { DidActivationService } from '../did-activation/did-activation.service';
import { SetDidActivationDto } from '../did-activation/dto/set-did-activation.dto';

@ApiTags('Global Number Inventory')
@Roles(Role.SUPER_ADMIN)
@Controller('number-inventory')
export class NumberInventoryController {
  constructor(
    private readonly inventory: NumberInventoryService,
    private readonly didActivation: DidActivationService,
  ) {}

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
  @Patch(':id/activation')
  setActivation(@Param('id') id: string, @Body() dto: SetDidActivationDto) {
    return this.didActivation.setActivation(id, 'admin', dto.enabled);
  }
  @Delete(':id/assignment')
  unassign(@Param('id') id: string) {
    return this.inventory.unassign(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.inventory.remove(id);
  }
}
