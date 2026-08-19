import { AuthType, EndpointDirection, Transport } from '@prisma/client';
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

export class CreateCustomerEndpointDto {
  @IsString() @MaxLength(100) name!: string;
  @IsString() @MaxLength(255) host!: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) port?: number;
  @IsOptional() @IsEnum(Transport) transport?: Transport;
  @IsOptional() @IsEnum(EndpointDirection) direction?: EndpointDirection;
  @IsOptional() @IsEnum(AuthType) authType?: AuthType;
  @IsOptional() @IsString() @MaxLength(255) authUsername?: string;
  @IsOptional() @IsString() authSecretHash?: string;
  @IsOptional() @IsString() @MaxLength(255) realm?: string;
  @IsOptional() @IsUUID() ingressNormalizationProfileId?: string;
  @IsOptional() @IsUUID() egressNormalizationProfileId?: string;
  @IsOptional() @IsInt() @Min(1) channelLimit?: number;
  @IsOptional() @IsInt() @Min(1) priority?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
