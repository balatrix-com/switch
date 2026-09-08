import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export enum PlanCategory {
  ASSET = 'asset',
  MINUTES = 'minutes',
}

export enum PlanStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum ValidityUnit {
  DAY = 'day',
  DAYS = 'days',
  MONTH = 'month',
  MONTHS = 'months',
  YEAR = 'year',
  YEARS = 'years',
}


export class CreatePlanDto {
  @ApiProperty({ description: 'Display name of the plan', example: 'Enterprise Toll-Free & DID Bundle' })
  @IsString()
  @MinLength(1)
  plan_name!: string;

  @ApiProperty({ enum: PlanCategory, description: 'Category: asset or minutes', example: PlanCategory.ASSET })
  @IsEnum(PlanCategory)
  plan_category!: PlanCategory;

  @ApiPropertyOptional({ enum: PlanStatus, default: PlanStatus.ACTIVE })
  @IsOptional()
  @IsEnum(PlanStatus)
  status?: PlanStatus;

  // Asset plan fields
  @ApiPropertyOptional({ description: 'Asset type e.g. TFN, DID, BOTH', example: 'TFN' })
  @IsOptional()
  @IsString()
  asset_type?: string;

  @ApiPropertyOptional({ description: 'One-time charge', example: 49.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  otc?: number;

  @ApiPropertyOptional({ description: 'Recurring subscription cost', example: 99.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  recurring_cost?: number;

  @ApiPropertyOptional({ description: 'Validity duration value', example: 30 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  validity_value?: number;

  @ApiPropertyOptional({ enum: ValidityUnit, default: ValidityUnit.DAYS })
  @IsOptional()
  @IsEnum(ValidityUnit)
  validity_unit?: ValidityUnit;

  @ApiPropertyOptional({ description: 'TFN allowance count', example: 2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tfn_asset_count?: number;

  @ApiPropertyOptional({ description: 'DID allowance count', example: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  did_asset_count?: number;

  @ApiPropertyOptional({ description: 'TFN bundled free minutes', example: 1500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tfn_free_minutes?: number;

  @ApiPropertyOptional({ description: 'DID bundled free minutes', example: 800 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  did_free_minutes?: number;

  // Minutes plan fields
  @ApiPropertyOptional({ description: 'Minutes bucket type: TFN, DID, or OB', example: 'OB' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Free minutes bundle amount', example: 5000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  free_minutes?: number;

  @ApiPropertyOptional({ description: 'Plan price', example: 25.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;
}

export class UpdatePlanDto {
  @ApiPropertyOptional({ description: 'Display name of the plan' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  plan_name?: string;

  @ApiPropertyOptional({ enum: PlanStatus })
  @IsOptional()
  @IsEnum(PlanStatus)
  status?: PlanStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  otc?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  recurring_cost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  validity_value?: number;

  @ApiPropertyOptional({ enum: ValidityUnit })
  @IsOptional()
  @IsEnum(ValidityUnit)
  validity_unit?: ValidityUnit;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  tfn_asset_count?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  did_asset_count?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  tfn_free_minutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  did_free_minutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  free_minutes?: number;
}

export class QueryPlansDto {
  @ApiPropertyOptional({ enum: PlanStatus })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: PlanCategory })
  @IsOptional()
  @IsString()
  plan_category?: string;
}
