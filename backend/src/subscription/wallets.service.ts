import { Injectable } from '@nestjs/common';
import { SubscriptionClientService } from './subscription-client.service';
import { WalletService } from '../wallet/wallet.service';
import { CustomerWallet } from '@prisma/client';
import {
  AdjustWalletDto,
  AssignNumberAssetDto,
  CreateCustomerWalletDto,
  DeductWalletDto,
} from './dto/wallet.dto';

@Injectable()
export class WalletsService {
  constructor(
    private readonly client: SubscriptionClientService,
    private readonly walletService: WalletService,
  ) {}

  private format(w: CustomerWallet) {
    return {
      id: w.id,
      customer_id: w.customerId,
      currency: w.currency,
      fiat_balance: Number(w.fiatBalance),
      credit_limit: Number(w.creditLimit),
      credit_used: Number(w.creditUsed),
      available_balance: Number(w.fiatBalance) + Number(w.creditLimit) - Number(w.creditUsed),
      tfn_free_minutes: w.tfnFreeMinutes,
      did_free_minutes: w.didFreeMinutes,
      ob_free_minutes: w.obFreeMinutes,
      is_suspended: w.isSuspended,
      created_at: w.createdAt,
      updated_at: w.updatedAt,
    };
  }

  async getWallet(customerId: string) {
    const wallet = await this.walletService.getWallet(customerId);
    return this.format(wallet);
  }

  async createWallet(dto: CreateCustomerWalletDto) {
    const wallet = await this.walletService.upsertWallet(dto.customer_id, {
      fiat_balance: dto.fiat_balance ?? 0,
      credit_limit: dto.credit_limit,
      currency: dto.currency ?? 'USD',
    });
    return this.format(wallet);
  }

  async adjustWallet(customerId: string, dto: AdjustWalletDto) {
    const wallet = await this.walletService.adjustWallet(customerId, dto);
    return this.format(wallet);
  }

  async deduct(dto: DeductWalletDto) {
    const wallet = await this.walletService.deductUsage(dto.customer_id, dto);
    return this.format(wallet);
  }

  async assignNumber(dto: AssignNumberAssetDto) {
    const res: any = await this.client.assignNumberAsset(dto);
    return res && res.data ? res.data : res;
  }
}
