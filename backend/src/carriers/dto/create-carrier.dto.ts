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

export class CreateCarrierDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(40)
  code!: string;

  @IsOptional()
  @IsUUID()
  defaultIngressProfileId?: string;

  @IsOptional()
  @IsUUID()
  defaultEgressProfileId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  defaultCallTimeoutSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultChannelLimit?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
