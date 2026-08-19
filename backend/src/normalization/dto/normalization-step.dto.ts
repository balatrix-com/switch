import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { NormalizationOperation } from '../normalization.types';

export class NormalizationStepDto {
  @IsEnum(NormalizationOperation)
  operation!: NormalizationOperation;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  value?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  pattern?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  replacement?: string;
}
