import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { NormalizationOwnerType } from '@prisma/client';
import { NormalizationStepDto } from './normalization-step.dto';

export class CreateNormalizationProfileDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsEnum(NormalizationOwnerType)
  ownerType!: NormalizationOwnerType;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  carrierId?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => NormalizationStepDto)
  steps!: NormalizationStepDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
