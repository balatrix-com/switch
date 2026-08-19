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
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { RouteDirection } from '@prisma/client';
import { CustomerId } from '../common/decorators/customer-id.decorator';
import { CreateSwitchRouteDto } from './dto/create-switch-route.dto';
import { UpdateSwitchRouteDto } from './dto/update-switch-route.dto';
import { SwitchRoutesService } from './switch-routes.service';

@ApiTags('Switch Routes')
@Controller('switch-routes')
export class SwitchRoutesController {
  constructor(private readonly routes: SwitchRoutesService) {}

  @Get('global')
  listAll(@Query('direction') direction?: RouteDirection) {
    return this.routes.listAll(direction);
  }

  @Get()
  @ApiSecurity('customer-context')
  list(
    @CustomerId() customerId: string,
    @Query('direction') direction?: RouteDirection,
  ) {
    return this.routes.list(customerId, direction);
  }

  @Get(':id')
  @ApiSecurity('customer-context')
  findOne(@CustomerId() customerId: string, @Param('id') id: string) {
    return this.routes.findOne(customerId, id);
  }

  @Post()
  @ApiSecurity('customer-context')
  create(@CustomerId() customerId: string, @Body() dto: CreateSwitchRouteDto) {
    return this.routes.create(customerId, dto);
  }

  @Patch(':id')
  @ApiSecurity('customer-context')
  update(
    @CustomerId() customerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSwitchRouteDto,
  ) {
    return this.routes.update(customerId, id, dto);
  }

  @Post(':id/rebuild')
  @ApiSecurity('customer-context')
  rebuild(@CustomerId() customerId: string, @Param('id') id: string) {
    return this.routes.rebuild(customerId, id);
  }

  @Delete(':id')
  @ApiSecurity('customer-context')
  remove(@CustomerId() customerId: string, @Param('id') id: string) {
    return this.routes.remove(customerId, id);
  }
}
