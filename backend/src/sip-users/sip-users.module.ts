import { Module } from '@nestjs/common';
import { SipUsersController } from './sip-users.controller';
import { SipUsersService } from './sip-users.service';

@Module({ controllers: [SipUsersController], providers: [SipUsersService] })
export class SipUsersModule {}
