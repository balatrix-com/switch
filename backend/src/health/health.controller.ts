import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
@Public()
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
