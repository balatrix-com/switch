import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCarrierRouteDto {
  @IsUUID() carrierEndpointId!: string;
  @IsString() @MaxLength(100) name!: string;
  @IsString() @MaxLength(40) matchPrefix!: string;
  @IsOptional() @IsUUID() egressNormalizationProfileId?: string;
  @IsOptional() @IsInt() @Min(1) priority?: number;
  @IsOptional() @IsNumber() @Min(0) cost?: number;
  @IsOptional() @IsInt() @Min(1) channelLimit?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
