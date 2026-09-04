import { Global, Module } from '@nestjs/common';
import { KamailioDbService } from './kamailio-db.service';

@Global()
@Module({
  providers: [KamailioDbService],
  exports: [KamailioDbService],
})
export class KamailioModule {}
