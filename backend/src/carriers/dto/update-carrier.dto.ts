import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateCarrierDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsUUID() defaultIngressProfileId?: string | null;
  @IsOptional() @IsUUID() defaultEgressProfileId?: string | null;
  @IsOptional() @IsInt() @Min(1) defaultChannelLimit?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
