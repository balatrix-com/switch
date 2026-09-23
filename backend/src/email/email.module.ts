import { Module } from '@nestjs/common';
import { ZeptoMailService } from './zeptomail.service';

@Module({
  providers: [ZeptoMailService],
  exports: [ZeptoMailService],
})
export class EmailModule {}
