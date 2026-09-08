import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { RouteXmlModule } from '../route-xml/route-xml.module';
import { RoutingModule } from '../routing/routing.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [RouteXmlModule, RoutingModule, SubscriptionModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}

