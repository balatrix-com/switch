import { Module } from '@nestjs/common';
import { NumberInventoryController } from './number-inventory.controller';
import { NumberInventoryService } from './number-inventory.service';
import { RouteXmlModule } from '../route-xml/route-xml.module';

@Module({
  imports: [RouteXmlModule],
  controllers: [NumberInventoryController],
  providers: [NumberInventoryService],
  exports: [NumberInventoryService],
})
export class NumberInventoryModule {}
