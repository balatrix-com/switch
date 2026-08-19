import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CarriersService } from './carriers.service';
import { CreateCarrierEndpointDto } from './dto/create-carrier-endpoint.dto';
import { CreateCarrierRouteDto } from './dto/create-carrier-route.dto';
import { CreateCarrierDto } from './dto/create-carrier.dto';
import { UpdateCarrierEndpointDto } from './dto/update-carrier-endpoint.dto';
import { UpdateCarrierDto } from './dto/update-carrier.dto';

@ApiTags('Carriers')
@Controller('carriers')
export class CarriersController {
  constructor(private readonly carriers: CarriersService) {}

  @Get() list() {
    return this.carriers.list();
  }
  @Get(':id') findOne(@Param('id') id: string) {
    return this.carriers.findOne(id);
  }
  @Post() create(@Body() dto: CreateCarrierDto) {
    return this.carriers.create(dto);
  }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateCarrierDto) {
    return this.carriers.update(id, dto);
  }
  @Delete(':id') remove(@Param('id') id: string) {
    return this.carriers.remove(id);
  }

  @Post(':carrierId/endpoints')
  createEndpoint(
    @Param('carrierId') carrierId: string,
    @Body() dto: CreateCarrierEndpointDto,
  ) {
    return this.carriers.createEndpoint(carrierId, dto);
  }

  @Patch(':carrierId/endpoints/:id')
  updateEndpoint(
    @Param('carrierId') carrierId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCarrierEndpointDto,
  ) {
    return this.carriers.updateEndpoint(carrierId, id, dto);
  }

  @Delete(':carrierId/endpoints/:id')
  removeEndpoint(
    @Param('carrierId') carrierId: string,
    @Param('id') id: string,
  ) {
    return this.carriers.removeEndpoint(carrierId, id);
  }

  @Post(':carrierId/routes')
  createRoute(
    @Param('carrierId') carrierId: string,
    @Body() dto: CreateCarrierRouteDto,
  ) {
    return this.carriers.createRoute(carrierId, dto);
  }

  @Delete(':carrierId/routes/:id')
  removeRoute(@Param('carrierId') carrierId: string, @Param('id') id: string) {
    return this.carriers.removeRoute(carrierId, id);
  }
}
