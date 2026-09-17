import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    const expectedKey = this.configService.get<string>('SWITCH_API_KEY');

    if (!expectedKey) {
       // If not configured, we allow it for backwards compatibility/local dev
       // or we could throw. Let's allow if not set, or throw if required.
       return true; 
    }

    if (apiKey === expectedKey) {
      return true;
    }

    throw new UnauthorizedException('Invalid API key');
  }
}
