import { Global, Module } from '@nestjs/common';
import { XmlCurlCacheService } from './xml-curl-cache.service';

@Global()
@Module({
  providers: [XmlCurlCacheService],
  exports: [XmlCurlCacheService],
})
export class XmlCurlIntegrationModule {}
