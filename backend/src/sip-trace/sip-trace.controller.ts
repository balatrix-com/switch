import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  SearchSipTraceDto,
  SipTraceWindowDto,
} from './dto/search-sip-trace.dto';
import { SipTraceService } from './sip-trace.service';

@ApiTags('SIP Trace')
@Controller('sip-trace')
export class SipTraceController {
  constructor(private readonly sipTrace: SipTraceService) {}

  @Get('search')
  search(@Query() query: SearchSipTraceDto) {
    return this.sipTrace.search(query);
  }

  @Get('calls/:callId')
  detail(@Param('callId') callId: string, @Query() window: SipTraceWindowDto) {
    return this.sipTrace.detail(callId, window);
  }

  @Get('calls/:callId/messages')
  messages(
    @Param('callId') callId: string,
    @Query() window: SipTraceWindowDto,
  ) {
    return this.sipTrace.messages(callId, window);
  }

  @Get('calls/:callId/flow')
  flow(@Param('callId') callId: string, @Query() window: SipTraceWindowDto) {
    return this.sipTrace.flow(callId, window);
  }

  @Get('calls/:callId/raw')
  raw(@Param('callId') callId: string, @Query() window: SipTraceWindowDto) {
    return this.sipTrace.raw(callId, window);
  }

  @Get('calls/:callId/logs')
  logs(@Param('callId') callId: string, @Query() window: SipTraceWindowDto) {
    return this.sipTrace.logs(callId, window);
  }

  @Get('calls/:callId/rtcp')
  rtcp(@Param('callId') callId: string, @Query() window: SipTraceWindowDto) {
    return this.sipTrace.rtcp(callId, window);
  }
}
