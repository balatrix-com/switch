import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const apiKey = request.headers['x-api-key'];

    const expectedKey = this.configService
      .get<string>('SWITCH_API_KEY')
      ?.trim();

    if (!expectedKey || expectedKey === 'change-me')
      throw new ServiceUnavailableException('Switch API key is not configured');

    if (typeof apiKey !== 'string')
      throw new UnauthorizedException('Invalid API key');

    const actualBuffer = Buffer.from(apiKey);
    const expectedBuffer = Buffer.from(expectedKey);
    if (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    )
      return true;

    throw new UnauthorizedException('Invalid API key');
  }
}
