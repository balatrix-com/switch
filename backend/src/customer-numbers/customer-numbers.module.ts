import { Module } from '@nestjs/common';
import { CustomerNumbersController } from './customer-numbers.controller';
import { CustomerNumbersService } from './customer-numbers.service';
import { RouteXmlModule } from '../route-xml/route-xml.module';

@Module({
  imports: [RouteXmlModule],
  controllers: [CustomerNumbersController],
  providers: [CustomerNumbersService],
  exports: [CustomerNumbersService],
})
export class CustomerNumbersModule {}
