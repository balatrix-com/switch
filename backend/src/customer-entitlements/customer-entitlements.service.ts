import { Injectable } from '@nestjs/common';

@Injectable()
export class CustomerEntitlementsService {
  async assertCanCreateMonitorExtension(_customerId: string): Promise<void> {
    // Subscription entitlement enforcement will be added here when plans land.
  }
}
