import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CustomerId } from '../common/decorators/customer-id.decorator';
import { RecordingsService } from './recordings.service';

@ApiTags('Call Recordings')
@ApiHeader({ name: 'X-Customer-ID', required: false })
@Controller('recordings')
export class RecordingsController {
  constructor(private readonly recordings: RecordingsService) {}

  @Get(':sessionUuid')
  stream(
    @Param('sessionUuid') sessionUuid: string,
    @CustomerId({ required: false }) customerId: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    return this.recordings.stream(
      sessionUuid,
      response,
      customerId,
      request.headers['range'],
    );
  }
}
