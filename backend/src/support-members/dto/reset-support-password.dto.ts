import { IsString, MinLength } from 'class-validator';

export class ResetSupportPasswordDto {
  @IsString() @MinLength(10) password!: string;
}
