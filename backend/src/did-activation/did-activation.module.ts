import { Module } from '@nestjs/common';
import { RouteXmlModule } from '../route-xml/route-xml.module';
import { DidActivationService } from './did-activation.service';

@Module({
  imports: [RouteXmlModule],
  providers: [DidActivationService],
  exports: [DidActivationService],
})
export class DidActivationModule {}
