import { Module } from '@nestjs/common';
import { CustomerNumbersController } from './customer-numbers.controller';
import { CustomerNumbersService } from './customer-numbers.service';
import { RouteXmlModule } from '../route-xml/route-xml.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [RouteXmlModule, BillingModule],
  controllers: [CustomerNumbersController],
  providers: [CustomerNumbersService],
  exports: [CustomerNumbersService],
})
export class CustomerNumbersModule {}
