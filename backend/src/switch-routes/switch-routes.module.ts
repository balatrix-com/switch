import { Module } from '@nestjs/common';
import { SwitchRoutesController } from './switch-routes.controller';
import { SwitchRoutesService } from './switch-routes.service';
import { RouteXmlModule } from '../route-xml/route-xml.module';
import { RoutingModule } from '../routing/routing.module';

@Module({
  imports: [RouteXmlModule, RoutingModule],
  controllers: [SwitchRoutesController],
  providers: [SwitchRoutesService],
  exports: [SwitchRoutesService],
})
export class SwitchRoutesModule {}
