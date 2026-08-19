import { CallerIdMode } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCustomerDto {
  @IsString() @MaxLength(40) accountCode!: string;
  @IsString() @MaxLength(150) name!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) creditBalance?: number;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(1) defaultChannelLimit?: number;
  @IsOptional() @IsUUID() defaultIngressProfileId?: string;
  @IsOptional() @IsUUID() defaultEgressProfileId?: string;
  @IsOptional() @IsEnum(CallerIdMode) defaultCallerIdMode?: CallerIdMode;
}
