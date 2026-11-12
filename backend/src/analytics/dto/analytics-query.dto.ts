import { IsIn, IsISO8601, IsOptional, Matches } from 'class-validator';

export class AnalyticsQueryDto {
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsIn(['INBOUND', 'OUTBOUND']) direction?: 'INBOUND' | 'OUTBOUND';
  @IsOptional() @Matches(/^(?:\d{6}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i) customerId?: string;
}
