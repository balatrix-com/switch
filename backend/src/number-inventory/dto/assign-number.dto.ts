import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class AssignNumberDto {
  @Matches(/^(?:\d{6}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i)
  customerId!: string;
  @IsOptional() @IsString() @MaxLength(100) label?: string;
}
