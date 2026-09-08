import { Module } from '@nestjs/common';
import { SubscriptionClientService } from './subscription-client.service';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { WalletsService } from './wallets.service';
import {
  NumberAssigningController,
  WalletsController,
} from './wallets.controller';

@Module({
  controllers: [PlansController, WalletsController, NumberAssigningController],
  providers: [SubscriptionClientService, PlansService, WalletsService],
  exports: [SubscriptionClientService, PlansService, WalletsService],
})
export class SubscriptionModule {}
