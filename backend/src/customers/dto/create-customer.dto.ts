import { CallerIdMode } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCustomerDto {
  @IsEmail() @MaxLength(254) adminEmail!: string;
  @IsString() @MinLength(6) @MaxLength(128) adminPassword!: string;
  @IsOptional() @IsString() @MaxLength(150) contactName?: string;
  @IsString() @MaxLength(40) accountCode!: string;
  @IsString() @MaxLength(150) name!: string;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  creditBalance?: number;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) extensionLimit?: number;
  @IsOptional() @IsInt() @Min(1) defaultChannelLimit?: number;
  @IsOptional() @IsUUID() defaultIngressProfileId?: string;
  @IsOptional() @IsUUID() defaultEgressProfileId?: string;
  @IsOptional() @IsEnum(CallerIdMode) defaultCallerIdMode?: CallerIdMode;
  @IsOptional() @IsUUID() rateCardId?: string;
  @IsOptional() @IsInt() @Min(1) recordingRateCardId?: number;
}
