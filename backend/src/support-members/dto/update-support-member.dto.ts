import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { UserStatus } from '@prisma/client';

export class UpdateSupportMemberDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
}
