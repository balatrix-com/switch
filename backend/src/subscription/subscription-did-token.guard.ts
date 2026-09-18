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
export class SubscriptionDidTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('SUBSCRIPTION_DID_API_TOKEN')?.trim();
    if (!expected || expected === 'change-me')
      throw new ServiceUnavailableException('Subscription DID API token is not configured');
    const supplied = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>().headers['x-subscription-did-token'];
    if (typeof supplied !== 'string') throw new UnauthorizedException('Invalid subscription DID token');
    const actualBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(expected);
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) throw new UnauthorizedException('Invalid subscription DID token');
    return true;
  }
}
