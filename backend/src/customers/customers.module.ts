import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { RouteXmlModule } from '../route-xml/route-xml.module';
import { RoutingModule } from '../routing/routing.module';

@Module({
  imports: [RouteXmlModule, RoutingModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
