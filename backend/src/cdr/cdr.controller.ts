import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CdrService } from './cdr.service';
import { ListCdrDto } from './dto/list-cdr.dto';

@ApiTags('CDR')
@Controller('cdrs')
export class CdrController {
  constructor(private readonly cdr: CdrService) {}

  @Get()
  list(@Query() query: ListCdrDto) {
    return this.cdr.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cdr.findOne(id);
  }

  @Get(':id/sip-trace')
  sipTrace(@Param('id') id: string) {
    return this.cdr.createSipTraceLinks(id);
  }
}
