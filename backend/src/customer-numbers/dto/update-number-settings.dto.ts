import { CallerIdMode, DestinationType } from '@prisma/client';
import {
  IsEnum,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateNumberSettingsDto {
  @IsOptional()
  @IsEnum(DestinationType)
  destinationType?: DestinationType | null;
  @IsOptional() @IsUUID() primaryEndpointId?: string | null;
  @IsOptional() @IsUUID() targetSipUserId?: string | null;
  @IsOptional() @IsString() @MaxLength(40) forwardNumber?: string | null;
  @IsOptional() @IsUUID() outboundCarrierEndpointId?: string | null;
  @IsOptional() @IsUUID() failoverEndpointId?: string | null;
  @IsOptional() @IsString() @MaxLength(40) failoverNumber?: string | null;
  @IsOptional() @IsUUID() ingressNormalizationProfileId?: string | null;
  @IsOptional() @IsUUID() egressNormalizationProfileId?: string | null;
  @IsOptional() @IsEnum(CallerIdMode) callerIdMode?: CallerIdMode | null;
  @IsOptional() @IsString() @MaxLength(40) callerIdNumber?: string | null;
  @IsOptional() @IsString() @MaxLength(20) callerIdStripPrefix?: string | null;
  @IsOptional() @IsString() @MaxLength(20) callerIdAddPrefix?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(600) callTimeoutSeconds?: number | null;
  @IsOptional() @IsInt() @Min(1) channelLimit?: number | null;
  @IsOptional() @IsBoolean() recordingEnabled?: boolean | null;
}
