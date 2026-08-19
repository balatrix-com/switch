import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ResolveCustomerOutboundDto {
  @IsString()
  @MaxLength(80)
  destinationNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  callerIdNumber?: string;

  @IsOptional()
  @IsUUID()
  customerEndpointId?: string;
}
