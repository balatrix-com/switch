import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendCredentialsDto {
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}
