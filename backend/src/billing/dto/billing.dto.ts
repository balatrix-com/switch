import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDecimal,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BillingParty, RateCardType, RouteDirection } from '@prisma/client';

export class CreateRateCardDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsEnum(RateCardType)
  type!: RateCardType;

  @Transform(({ value }) => String(value).trim().toUpperCase())
  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUUID()
  defaultMinimumBillingSettingId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateRateCardDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => String(value).trim().toUpperCase())
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUUID()
  defaultMinimumBillingSettingId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class RateCardItemDto {
  @IsString()
  @MaxLength(40)
  prefix!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  description?: string;

  @IsEnum(RouteDirection)
  direction!: RouteDirection;

  @Transform(({ value }) => String(value))
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  ratePerMinute!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  priority?: number;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UploadRateCardDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RateCardItemDto)
  items!: RateCardItemDto[];
}

export class AssignRateCardDto {
  @IsUUID()
  rateCardId!: string;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: string;
}

export class CreateMinimumBillingSettingDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsEnum(BillingParty)
  party!: BillingParty;

  @IsInt()
  @Min(1)
  @Max(86400)
  initialIncrementSeconds!: number;

  @IsInt()
  @Min(1)
  @Max(86400)
  incrementSeconds!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateMinimumBillingSettingDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86400)
  initialIncrementSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86400)
  incrementSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AssignMinimumBillingDto {
  @IsUUID()
  settingId!: string;
}

