import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class XmlCurlCacheService {
  private readonly logger = new Logger(XmlCurlCacheService.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config: ConfigService) {
    this.baseUrl = config
      .get<string>('XML_CURL_SERVICE_URL', 'http://127.0.0.1:8000')
      .replace(/\/$/, '');
    this.token = config.get<string>('XML_CURL_CACHE_TOKEN', 'change-me');
  }

  async flush(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/admin/cache/flush`, {
        method: 'POST',
        headers: { 'X-Cache-Token': this.token },
        signal: AbortSignal.timeout(2_000),
      });
      if (!response.ok) {
        this.logger.warn(
          `FreeSWITCH CURL cache flush returned HTTP ${response.status}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `FreeSWITCH CURL cache flush unavailable: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
