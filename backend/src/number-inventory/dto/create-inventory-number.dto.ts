import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateInventoryNumberDto {
  @IsString() @MaxLength(40) canonicalNumber!: string;
  @IsOptional() @IsString() @MaxLength(40) displayNumber?: string;
  @IsOptional() @IsString() @MaxLength(30) numberType?: string;
  @IsOptional() @IsString() @MaxLength(5) countryCode?: string;
  @IsOptional() @IsString() @MaxLength(100) region?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
