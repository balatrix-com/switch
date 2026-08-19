import { SourceType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSourceAuthDto {
  @IsEnum(SourceType) sourceType!: SourceType;
  @IsString() @MaxLength(255) ipAddress!: string;
  @IsOptional() @IsInt() @Min(0) @Max(65535) port?: number;
  @IsOptional() @IsString() @MaxLength(255) authUsername?: string;
  @IsOptional() @IsString() authSecretHash?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() carrierId?: string;
  @IsOptional() @IsUUID() customerEndpointId?: string;
  @IsOptional() @IsUUID() carrierEndpointId?: string;
  @IsOptional() @IsUUID() ingressNormalizationProfileId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
