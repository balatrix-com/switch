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

  @ApiPropertyOptional({ description: 'TFN Free minutes' })
  @IsOptional()
  @IsNumber()
  @Min(0)
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

  @ApiProperty({ description: 'Usage type: TFN, DID, or OB', example: 'TFN' })
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

  @ApiProperty({ description: 'Number type: TFN or DID', example: 'TFN' })
  @IsString()
  @IsIn(['TFN', 'DID', 'tfn', 'did'])
  number_type!: string;

  @ApiProperty({ description: 'Phone number' })
  @IsString()
  number!: string;
}
