import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { PrismaService } from '../prisma/prisma.service';

type RecordingOwner = { customerId: string };

@Injectable()
export class RecordingsService {
  private readonly serviceUrl: string;
  private readonly token: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.serviceUrl = config
      .get<string>(
        'RECORDING_SERVICE_URL',
        config.get<string>('XML_CURL_SERVICE_URL', 'http://127.0.0.1:8000'),
      )
      .replace(/\/$/, '');
    this.token = config.get<string>(
      'RECORDING_ACCESS_TOKEN',
      config.get<string>('XML_CURL_CACHE_TOKEN', 'change-me'),
    );
  }

  async stream(
    sessionUuid: string,
    response: Response,
    requestedCustomerId?: string,
  ): Promise<void> {
    if (!/^[A-Za-z0-9-]{1,128}$/.test(sessionUuid)) {
      throw new NotFoundException('Recording not found');
    }
    const owners = await this.prisma.$queryRaw<RecordingOwner[]>(Prisma.sql`
      SELECT customer_id AS "customerId"
      FROM cdr
      WHERE session_uuid = ${sessionUuid}
      LIMIT 1
    `);
    const customerId = owners[0]?.customerId;
    if (
      !customerId ||
      (requestedCustomerId && requestedCustomerId !== customerId)
    ) {
      throw new NotFoundException('Recording not found');
    }

    let remote: globalThis.Response;
    try {
      remote = await fetch(
        `${this.serviceUrl}/recordings/${encodeURIComponent(customerId)}/${encodeURIComponent(sessionUuid)}.mp3`,
        { headers: { 'X-Recording-Token': this.token } },
      );
    } catch (error) {
      throw new BadGatewayException(
        `Recording service is unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (remote.status === 404)
      throw new NotFoundException('Recording not found');
    if (!remote.ok || !remote.body) {
      throw new BadGatewayException(
        `Recording service returned HTTP ${remote.status}`,
      );
    }
    response.status(200);
    response.setHeader('Content-Type', 'audio/mpeg');
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${sessionUuid}.mp3"`,
    );
    const contentLength = remote.headers.get('content-length');
    if (contentLength) response.setHeader('Content-Length', contentLength);
    Readable.fromWeb(remote.body as never).pipe(response);
  }
}
