import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { DidActivationService } from '../did-activation/did-activation.service';
import { SetDidActivationDto } from '../did-activation/dto/set-did-activation.dto';
import { SubscriptionDidTokenGuard } from './subscription-did-token.guard';

@ApiTags('Subscription DID Status')
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly didActivation: DidActivationService) {}

  @Public()
  @UseGuards(SubscriptionDidTokenGuard)
  @ApiHeader({ name: 'X-Subscription-Did-Token', required: true })
  @ApiOperation({ summary: 'Set subscription activation for a DID; not yet called by subscription workflows' })
  @Patch('dids/:id/activation')
  setDidActivation(@Param('id') id: string, @Body() dto: SetDidActivationDto) {
    return this.didActivation.setActivation(id, 'subscription', dto.enabled);
  }
}
