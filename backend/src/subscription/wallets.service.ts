import { Injectable } from '@nestjs/common';
import { SubscriptionClientService } from './subscription-client.service';
import {
  AdjustWalletDto,
  AssignNumberAssetDto,
  CreateCustomerWalletDto,
  DeductWalletDto,
} from './dto/wallet.dto';

@Injectable()
export class WalletsService {
  constructor(private readonly client: SubscriptionClientService) {}

  async getWallet(customerId: string) {
    const res: any = await this.client.getWallet(customerId);
    return res && res.data ? res.data : res;
  }

  async createWallet(dto: CreateCustomerWalletDto) {
    const res: any = await this.client.createCustomerWallet(
      dto.customer_id,
      dto.fiat_balance,
      dto.currency,
      dto.credit_limit,
    );
    return res && res.data ? res.data : res;
  }

  async adjustWallet(customerId: string, dto: AdjustWalletDto) {
    const res: any = await this.client.adjustWallet(customerId, dto);
    return res && res.data ? res.data : res;
  }

  async deduct(dto: DeductWalletDto) {
    const res: any = await this.client.deductWallet(dto);
    return res && res.data ? res.data : res;
  }

  async assignNumber(dto: AssignNumberAssetDto) {
    const res: any = await this.client.assignNumberAsset(dto);
    return res && res.data ? res.data : res;
  }

}
