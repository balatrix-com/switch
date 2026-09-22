import { CallerIdMode, DestinationType, MatchType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateSwitchRouteDto {
  @IsOptional() @IsUUID() customerNumberId?: string | null;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsEnum(MatchType) matchType?: MatchType;
  @IsOptional() @IsString() @MaxLength(40) matchValue?: string;
  @IsOptional() @IsInt() @Min(1) priority?: number;
  @IsOptional()
  @IsEnum(DestinationType)
  destinationType?: DestinationType | null;
  @IsOptional() @IsUUID() targetCustomerEndpointId?: string | null;
  @IsOptional() @IsUUID() targetCarrierId?: string | null;
  @IsOptional() @IsUUID() targetCarrierEndpointId?: string | null;
  @IsOptional() @IsString() @MaxLength(40) destinationNumber?: string | null;
  @IsOptional() @IsUUID() failoverCustomerEndpointId?: string | null;
  @IsOptional() @IsString() @MaxLength(40) failoverNumber?: string | null;
  @IsOptional() @IsUUID() ingressNormalizationProfileId?: string | null;
  @IsOptional() @IsUUID() egressNormalizationProfileId?: string | null;
  @IsOptional() @IsEnum(CallerIdMode) callerIdMode?: CallerIdMode | null;
  @IsOptional() @IsString() @MaxLength(40) callerIdNumber?: string | null;
  @IsOptional() @IsString() @MaxLength(20) callerIdStripPrefix?: string | null;
  @IsOptional() @IsString() @MaxLength(20) callerIdAddPrefix?: string | null;
  @IsOptional() @IsInt() @Min(1) channelLimit?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
