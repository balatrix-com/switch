import { Global, Module } from '@nestjs/common';
import { NormalizationController } from './normalization.controller';
import { NormalizationEngineService } from './normalization-engine.service';
import { NormalizationProfilesService } from './normalization-profiles.service';

@Global()
@Module({
  controllers: [NormalizationController],
  providers: [NormalizationEngineService, NormalizationProfilesService],
  exports: [NormalizationEngineService, NormalizationProfilesService],
})
export class NormalizationModule {}
