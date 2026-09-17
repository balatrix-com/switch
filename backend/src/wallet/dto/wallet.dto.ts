import { IsNumber, IsOptional, Min, IsString, IsNotEmpty } from 'class-validator';

export class TopUpWalletDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;
}

export class CreditMinutesDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  tfn_free_minutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  did_free_minutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ob_free_minutes?: number;
}

export class DebitOtcDto {
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  plan_id?: string;

  @IsOptional()
  @IsString()
  plan_name?: string;
}
