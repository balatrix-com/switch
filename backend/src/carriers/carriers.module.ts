import { Module } from '@nestjs/common';
import { CarriersController } from './carriers.controller';
import { CarriersService } from './carriers.service';
import { RouteXmlModule } from '../route-xml/route-xml.module';
import { RoutingModule } from '../routing/routing.module';

@Module({
  imports: [RouteXmlModule, RoutingModule],
  controllers: [CarriersController],
  providers: [CarriersService],
  exports: [CarriersService],
})
export class CarriersModule {}
