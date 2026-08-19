import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  health(): { ok: true; service: string; timestamp: string } {
    return {
      ok: true,
      service: 'billing-switch',
      timestamp: new Date().toISOString(),
    };
  }
}
