import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class SubscribePlanDto {
  @ApiProperty({
    description: 'Unique Customer ID to subscribe',
    example: 'cust_9f81a742-5b9c-4820-801e-2895a973db1c',
  })
  @IsString()
  @MinLength(1)
  customer_id!: string;

  @ApiProperty({
    description: 'UUID of the plan to subscribe to',
    example: '52bf2c6e-2144-42f8-b3eb-be1cbda78e5f',
  })
  @IsString()
  @MinLength(1)
  plan_id!: string;

  @ApiPropertyOptional({
    description: 'Optional flag to bypass OTC wallet balance check (for admin provisioning)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  override_balance_check?: boolean;
}
