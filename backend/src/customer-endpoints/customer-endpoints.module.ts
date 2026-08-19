import { Module } from '@nestjs/common';
import { CustomerEndpointsController } from './customer-endpoints.controller';
import { CustomerEndpointsService } from './customer-endpoints.service';
import { RouteXmlModule } from '../route-xml/route-xml.module';
import { RoutingModule } from '../routing/routing.module';

@Module({
  imports: [RouteXmlModule, RoutingModule],
  controllers: [CustomerEndpointsController],
  providers: [CustomerEndpointsService],
  exports: [CustomerEndpointsService],
})
export class CustomerEndpointsModule {}
