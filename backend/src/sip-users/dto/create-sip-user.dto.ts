import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSipUserDto {
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_.-]+$/)
  username!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsOptional() @IsString() @MaxLength(40) sipProfile?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isMonitor?: boolean;
}
