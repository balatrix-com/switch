import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateSupportMemberDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(10) password!: string;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @Matches(/^\d{6}$/) customerId?: string;
}
