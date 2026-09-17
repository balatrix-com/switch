import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SupportMembersController } from './support-members.controller';
import { SupportMembersService } from './support-members.service';

@Module({ imports: [PrismaModule], controllers: [SupportMembersController], providers: [SupportMembersService] })
export class SupportMembersModule {}
