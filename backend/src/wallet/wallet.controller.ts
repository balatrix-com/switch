import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { TopUpWalletDto, CreditMinutesDto, DebitOtcDto } from './dto/wallet.dto';
import { ApiKeyAuthGuard } from '../common/guards/api-key.guard';

@Controller('billing/wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  getAllWallets() {
    return this.walletService.getAllWallets();
  }

  @Get(':customerId')
  getWallet(@Param('customerId') customerId: string) {
    return this.walletService.getWallet(customerId);
  }

  @Patch(':customerId')
  topUpWallet(@Param('customerId') customerId: string, @Body() dto: TopUpWalletDto) {
    return this.walletService.topUp(customerId, dto);
  }

  @Post(':customerId/credit-minutes')
  @UseGuards(ApiKeyAuthGuard)
  creditMinutes(@Param('customerId') customerId: string, @Body() dto: CreditMinutesDto) {
    return this.walletService.creditMinutes(customerId, dto);
  }

  @Post(':customerId/debit-otc')
  @UseGuards(ApiKeyAuthGuard)
  debitOtc(@Param('customerId') customerId: string, @Body() dto: DebitOtcDto) {
    return this.walletService.debitOtc(customerId, dto);
  }

  @Get(':customerId/transactions')
  getTransactions(
    @Param('customerId') customerId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.walletService.getTransactions(
      customerId,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 50,
    );
  }
}
