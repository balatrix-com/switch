import { IsString, Matches } from 'class-validator';

export class AssignSupportMemberDto {
  @IsString() @Matches(/^\d{6}$/) customerId!: string;
}
