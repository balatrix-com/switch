import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  SearchIndexedSipTraceDto,
  SearchSipTraceDto,
  SipTraceWindowDto,
} from './dto/search-sip-trace.dto';
import { CustomerSipTraceService } from './customer-sip-trace.service';
import { SipTraceService } from './sip-trace.service';

@ApiTags('SIP Trace')
@Roles(Role.SUPER_ADMIN)
@Controller('sip-trace')
export class SipTraceController {
  constructor(
    private readonly sipTrace: SipTraceService,
    private readonly indexedTraces: CustomerSipTraceService,
  ) {}

  @Get('indexed-calls')
  indexedCalls(@Query() query: SearchIndexedSipTraceDto) {
    return this.indexedTraces.listGlobal(query);
  }

  @Get('indexed-calls/:id')
  indexedDetail(@Param('id') id: string) {
    return this.indexedTraces.detailGlobal(id);
  }

  @Get('indexed-calls/:id/flow')
  indexedFlow(@Param('id') id: string) {
    return this.indexedTraces.flowGlobal(id);
  }

  @Get('indexed-calls/:id/messages/:messageId/raw')
  indexedRawMessage(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
  ) {
    return this.indexedTraces.rawMessageGlobal(id, messageId);
  }

  @Get('indexed-calls/:id/logs')
  indexedLogs(@Param('id') id: string) {
    return this.indexedTraces.logsGlobal(id);
  }

  @Get('indexed-calls/:id/rtcp')
  indexedRtcp(@Param('id') id: string) {
    return this.indexedTraces.rtcpGlobal(id);
  }

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

  @Get('calls/:callId/messages/:messageId/raw')
  rawMessage(
    @Param('callId') callId: string,
    @Param('messageId') messageId: string,
    @Query() window: SipTraceWindowDto,
  ) {
    return this.sipTrace.rawMessage(callId, messageId, window);
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
