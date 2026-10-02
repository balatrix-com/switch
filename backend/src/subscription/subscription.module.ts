import { Module } from '@nestjs/common';
import { SubscriptionClientService } from './subscription-client.service';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { WalletsService } from './wallets.service';
import {
  NumberAssigningController,
  WalletsController,
} from './wallets.controller';
import { DidActivationModule } from '../did-activation/did-activation.module';
import { WalletModule } from '../wallet/wallet.module';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionDidTokenGuard } from './subscription-did-token.guard';
import { SubscriptionsController } from './subscriptions.controller';

@Module({
  imports: [DidActivationModule, WalletModule],
  controllers: [PlansController, WalletsController, NumberAssigningController, SubscriptionController, SubscriptionsController],
  providers: [SubscriptionClientService, PlansService, WalletsService, SubscriptionDidTokenGuard],
  exports: [SubscriptionClientService, PlansService, WalletsService],
})
export class SubscriptionModule {}
