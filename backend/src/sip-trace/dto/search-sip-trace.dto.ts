import { Type } from 'class-transformer';
import {
  IsInt,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SearchSipTraceDto {
  @IsOptional() @IsString() callId?: string;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() caller?: string;
  @IsOptional() @IsString() callee?: string;
  @IsOptional() @IsString() srcIp?: string;
  @IsOptional() @IsString() dstIp?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  srcPort?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  dstPort?: number;
  @IsOptional() @IsString() responseCode?: string;
  @IsOptional() @IsString() cseqMethod?: string;
  @IsOptional() @IsString() correlationId?: string;
  @IsOptional() @IsString() node?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) captureId?: number;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) limit = 200;
}

export class SipTraceWindowDto {
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsString() callIds?: string;
}

export class SearchIndexedSipTraceDto {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() callId?: string;
  @IsOptional() @IsString() caller?: string;
  @IsOptional() @IsString() callee?: string;
  @IsOptional() @IsString() customerNumber?: string;
  @IsOptional() @IsString() srcIp?: string;
  @IsOptional() @IsString() dstIp?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(699)
  responseCode?: number;
  @IsOptional() @IsIn(['INBOUND', 'OUTBOUND']) direction?:
    'INBOUND' | 'OUTBOUND';
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 200;
}
