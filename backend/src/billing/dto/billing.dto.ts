import { Transform, Type } from 'class-transformer';
import {
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
} from 'class-validator';
import { BillingParty, RateCardType } from '@prisma/client';

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

  @Transform(({ value }) => String(value))
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  inboundRatePerMinute!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86400)
  inboundInitialIncrementSeconds!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86400)
  inboundIncrementSeconds!: number;

  @Transform(({ value }) => String(value))
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  outboundRatePerMinute!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86400)
  outboundInitialIncrementSeconds!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86400)
  outboundIncrementSeconds!: number;

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
  @Transform(({ value }) => String(value))
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  inboundRatePerMinute?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86400)
  inboundInitialIncrementSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86400)
  inboundIncrementSeconds?: number;

  @IsOptional()
  @Transform(({ value }) => String(value))
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  outboundRatePerMinute?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86400)
  outboundInitialIncrementSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86400)
  outboundIncrementSeconds?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
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
