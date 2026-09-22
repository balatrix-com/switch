import {
  CallerIdMode,
  DestinationType,
  MatchType,
  RouteDirection,
} from '@prisma/client';
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

export class CreateSwitchRouteDto {
  @IsOptional() @IsUUID() customerNumberId?: string;
  @IsString() @MaxLength(120) name!: string;
  @IsEnum(RouteDirection) direction!: RouteDirection;
  @IsOptional() @IsEnum(MatchType) matchType?: MatchType;
  @IsString() @MaxLength(40) matchValue!: string;
  @IsOptional() @IsInt() @Min(1) priority?: number;
  @IsOptional() @IsEnum(DestinationType) destinationType?: DestinationType;
  @IsOptional() @IsUUID() targetCustomerEndpointId?: string;
  @IsOptional() @IsUUID() targetCarrierId?: string;
  @IsOptional() @IsUUID() targetCarrierEndpointId?: string;
  @IsOptional() @IsString() @MaxLength(40) destinationNumber?: string;
  @IsOptional() @IsUUID() failoverCustomerEndpointId?: string;
  @IsOptional() @IsString() @MaxLength(40) failoverNumber?: string;
  @IsOptional() @IsUUID() ingressNormalizationProfileId?: string;
  @IsOptional() @IsUUID() egressNormalizationProfileId?: string;
  @IsOptional() @IsEnum(CallerIdMode) callerIdMode?: CallerIdMode;
  @IsOptional() @IsString() @MaxLength(40) callerIdNumber?: string;
  @IsOptional() @IsString() @MaxLength(20) callerIdStripPrefix?: string;
  @IsOptional() @IsString() @MaxLength(20) callerIdAddPrefix?: string;
  @IsOptional() @IsInt() @Min(1) channelLimit?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
