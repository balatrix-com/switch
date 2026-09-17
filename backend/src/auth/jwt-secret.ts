import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';

// Development without JWT_SECRET still works, but tokens expire on restart.
// A shared, unpredictable fallback is safer than a known hard-coded secret.
const ephemeralDevelopmentSecret = randomBytes(32).toString('hex');

export function jwtSecret(config: ConfigService): string {
  const configured = config.get<string>('JWT_SECRET')?.trim();
  if (configured) return configured;
  if (config.get<string>('NODE_ENV') === 'production') {
    throw new Error('JWT_SECRET must be configured in production');
  }
  return ephemeralDevelopmentSecret;
}
