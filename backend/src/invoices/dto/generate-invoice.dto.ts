import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export enum InvoiceMrcMode { AUTO = 'AUTO', MANUAL = 'MANUAL', HYBRID = 'HYBRID' }

export class ManualOtcItemDto {
  @IsString() @MaxLength(255) description!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount!: number;
}

export class GenerateInvoiceDto {
  @IsString() customerId!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsEnum(InvoiceMrcMode) mrcMode!: InvoiceMrcMode;
  @IsOptional() @IsBoolean() skipMrc?: boolean;
  @IsOptional() @IsBoolean() skipOtc?: boolean;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) manualMrcAmount?: number;
  @IsOptional() @IsString() @MaxLength(255) manualMrcDescription?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ManualOtcItemDto) manualOtcItems?: ManualOtcItemDto[];
  @IsOptional() @IsBoolean() includeCallRecordings?: boolean;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}
