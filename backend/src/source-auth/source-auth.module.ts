import { Module } from '@nestjs/common';
import { SourceAuthController } from './source-auth.controller';
import { SourceAuthService } from './source-auth.service';

@Module({
  controllers: [SourceAuthController],
  providers: [SourceAuthService],
  exports: [SourceAuthService],
})
export class SourceAuthModule {}
