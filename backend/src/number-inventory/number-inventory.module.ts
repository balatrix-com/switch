import { Module } from '@nestjs/common';
import { NumberInventoryController } from './number-inventory.controller';
import { NumberInventoryService } from './number-inventory.service';
import { RouteXmlModule } from '../route-xml/route-xml.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [RouteXmlModule, SubscriptionModule],
  controllers: [NumberInventoryController],
  providers: [NumberInventoryService],
  exports: [NumberInventoryService],
})
export class NumberInventoryModule {}

