import { CallerIdMode, DestinationType } from '@prisma/client';
import {
  IsEnum,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateCustomerSettingsDto {
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) monthlyMinimumSpend?: number;
  @IsOptional() @IsBoolean() recordingEnabled?: boolean;
  @IsOptional() @IsUUID() defaultEndpointId?: string | null;
  @IsOptional() @IsUUID() defaultIngressProfileId?: string | null;
  @IsOptional() @IsUUID() defaultEgressProfileId?: string | null;
  @IsOptional() @IsEnum(CallerIdMode) defaultCallerIdMode?: CallerIdMode;
  @IsOptional() @IsString() @MaxLength(40) defaultCallerIdNumber?:
    string | null;
  @IsOptional() @IsInt() @Min(1) defaultChannelLimit?: number | null;
  @IsOptional()
  @IsEnum(DestinationType)
  defaultDestinationType?: DestinationType;
  @IsOptional() @IsUUID() defaultTargetSipUserId?: string | null;
  @IsOptional() @IsString() @MaxLength(40) defaultForwardNumber?: string | null;
  @IsOptional() @IsUUID() defaultOutboundCarrierId?: string | null;
  @IsOptional() @IsUUID() defaultOutboundCarrierEndpointId?: string | null;
}
