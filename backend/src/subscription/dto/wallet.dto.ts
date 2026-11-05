import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCustomerWalletDto {
  @ApiProperty({ description: 'Customer ID', example: 'cust_123456' })
  @IsString()
  customer_id!: string;

  @ApiPropertyOptional({ description: 'Initial fiat balance', example: 100.0 })
  @IsOptional()
  @IsNumber()
  fiat_balance?: number;

  @ApiPropertyOptional({ description: 'Credit limit / line', example: 5000.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  credit_limit?: number;

  @ApiPropertyOptional({ description: 'Currency code', example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;
}

export class AdjustWalletDto {
  @ApiPropertyOptional({ description: 'Signed cash change; use negative to deduct. Cannot be combined with absolute balance or top-up.' })
  @IsOptional() @IsNumber() fiat_delta?: number;

  @ApiPropertyOptional({ description: 'Signed shared DID-minute change; use negative to deduct.' })
  @IsOptional() @IsNumber() did_minutes_delta?: number;

  @ApiPropertyOptional({ description: 'Signed outbound-minute change; use negative to deduct.' })
  @IsOptional() @IsNumber() ob_minutes_delta?: number;

  @ApiPropertyOptional({ description: 'Required reason for signed adjustments (for example MRC or OTC)' })
  @IsOptional() @IsString() reason?: string;

  @ApiPropertyOptional({ description: 'Classify a manual cash deduction for invoice/history reporting', enum: ['MRC', 'OTC', 'OTHER'] })
  @IsOptional() @IsIn(['MRC', 'OTC', 'OTHER']) adjustment_type?: 'MRC' | 'OTC' | 'OTHER';

  @ApiPropertyOptional({ description: 'Fiat balance adjustment / absolute value' })
  @IsOptional()
  @IsNumber()
  fiat_balance?: number;

  @ApiPropertyOptional({ description: 'Top-up amount to add to current fiat balance', example: 500.0 })
  @IsOptional()
  @IsNumber()
  topup_amount?: number;

  @ApiPropertyOptional({ description: 'Credit limit adjustment', example: 5000.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  credit_limit?: number;

  @ApiPropertyOptional({ description: 'Deprecated; must be zero. All inbound minutes use DID.' })
  @IsOptional()
  @IsIn([0])
  tfn_free_minutes?: number;

  @ApiPropertyOptional({ description: 'DID Free minutes' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  did_free_minutes?: number;

  @ApiPropertyOptional({ description: 'Outbound Free minutes' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  ob_free_minutes?: number;

  @ApiPropertyOptional({ description: 'Currency code' })
  @IsOptional()
  @IsString()
  currency?: string;
}

export class DeductWalletDto {
  @ApiProperty({ description: 'Customer ID' })
  @IsString()
  customer_id!: string;

  @ApiProperty({ description: 'Usage type: DID or OB (TFN is a temporary legacy alias for DID)', example: 'DID' })
  @IsString()
  @IsIn(['TFN', 'DID', 'OB'])
  usage_type!: string;

  @ApiPropertyOptional({ description: 'Call duration in seconds', example: 120 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  duration_seconds?: number;

  @ApiPropertyOptional({ description: 'Direct fiat amount to deduct', example: 1.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;
}

export class AssignNumberAssetDto {
  @ApiProperty({ description: 'Customer ID' })
  @IsString()
  customer_id!: string;

  @ApiPropertyOptional({ description: 'Plan ID (optional)' })
  @IsOptional()
  @IsString()
  plan_id?: string;

  @ApiProperty({ description: 'Number category (always DID)', example: 'DID' })
  @IsString()
  @IsIn(['DID'])
  number_type!: string;

  @ApiPropertyOptional({ description: 'DID subtype: Toll-Free or Local', example: 'TFN' })
  @IsOptional()
  @IsIn(['TFN', 'LOCAL'])
  number_subtype?: string;

  @ApiProperty({ description: 'Phone number' })
  @IsString()
  number!: string;
}
