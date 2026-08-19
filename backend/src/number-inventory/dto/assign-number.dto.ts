import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AssignNumberDto {
  @IsUUID() customerId!: string;
  @IsOptional() @IsString() @MaxLength(100) label?: string;
}
