import { Global, Module } from '@nestjs/common';
import { CustomerEntitlementsService } from './customer-entitlements.service';

@Global()
@Module({
  providers: [CustomerEntitlementsService],
  exports: [CustomerEntitlementsService],
})
export class CustomerEntitlementsModule {}
