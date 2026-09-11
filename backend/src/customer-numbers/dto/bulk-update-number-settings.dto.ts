import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDefined,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { UpdateNumberSettingsDto } from './update-number-settings.dto';

export class BulkUpdateNumberSettingsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  customerNumberIds!: string[];

  @IsDefined()
  @ValidateNested()
  @Type(() => UpdateNumberSettingsDto)
  settings!: UpdateNumberSettingsDto;

  @IsOptional()
  @IsBoolean()
  dbOnly?: boolean;
}
