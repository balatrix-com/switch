import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateSourceAuthDto {
  @IsOptional() @IsString() @MaxLength(255) ipAddress?: string;
  @IsOptional() @IsInt() @Min(0) @Max(65535) port?: number;
  @IsOptional() @IsString() @MaxLength(255) authUsername?: string | null;
  @IsOptional() @IsString() authSecretHash?: string | null;
  @IsOptional() @IsUUID() ingressNormalizationProfileId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
