import { Module } from '@nestjs/common';
import { RouteXmlModule } from '../route-xml/route-xml.module';
import { SourceAuthModule } from '../source-auth/source-auth.module';
import { RoutingController } from './routing.controller';
import { RoutingService } from './routing.service';

@Module({
  imports: [SourceAuthModule, RouteXmlModule],
  controllers: [RoutingController],
  providers: [
    RoutingService,
    { provide: 'ROUTING_SERVICE', useExisting: RoutingService },
  ],
  exports: [RoutingService],
})
export class RoutingModule {}
