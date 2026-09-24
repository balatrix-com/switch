import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  IsDecimal,
} from 'class-validator';

export class CreateRecordingRateCardDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @Transform(({ value }) => String(value))
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  rate!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86400)
  pulse?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  days?: number;

  @IsOptional()
  @IsIn(['Y', 'N'])
  activeIs?: 'Y' | 'N';
}

export class UpdateRecordingRateCardDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => String(value))
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  rate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86400)
  pulse?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  days?: number;

  @IsOptional()
  @IsIn(['Y', 'N'])
  activeIs?: 'Y' | 'N';
}

export class AssignRecordingRateCardDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  recRcId!: number;
}
