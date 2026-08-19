import { Module } from '@nestjs/common';
import { RouteXmlBuilderService } from './route-xml-builder.service';
import { RouteXmlController } from './route-xml.controller';
import { RouteXmlService } from './route-xml.service';
import { DidXmlGenerationService } from './did-xml-generation.service';

@Module({
  controllers: [RouteXmlController],
  providers: [
    RouteXmlBuilderService,
    RouteXmlService,
    DidXmlGenerationService,
    {
      provide: 'DID_XML_GENERATION_SERVICE',
      useExisting: DidXmlGenerationService,
    },
  ],
  exports: [RouteXmlBuilderService, RouteXmlService, DidXmlGenerationService],
})
export class RouteXmlModule {}
