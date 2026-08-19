import { RouteDirection } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ResolveCallDto {
  @IsEnum(RouteDirection)
  direction!: RouteDirection;

  @IsString()
  @MaxLength(255)
  sourceIp!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(65535)
  sourcePort?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  authUsername?: string;

  @IsString()
  @MaxLength(80)
  destinationNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  callerIdNumber?: string;
}
