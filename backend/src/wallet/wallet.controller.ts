import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { WalletService } from './wallet.service';
import {
  TopUpWalletDto,
  CreditMinutesDto,
  DebitOtcDto,
} from './dto/wallet.dto';
import { ApiKeyAuthGuard } from '../common/guards/api-key.guard';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';

@Controller('billing/wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN)
  getAllWallets() {
    return this.walletService.getAllWallets();
  }

  @Get(':customerId')
  @Roles(Role.SUPER_ADMIN, Role.CUSTOMER)
  getWallet(
    @Param('customerId') customerId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertCustomerAccess(user, customerId);
    return this.walletService.getWallet(customerId);
  }

  @Patch(':customerId')
  @Roles(Role.SUPER_ADMIN)
  topUpWallet(
    @Param('customerId') customerId: string,
    @Body() dto: TopUpWalletDto,
  ) {
    return this.walletService.topUp(customerId, dto);
  }

  @Post(':customerId/credit-minutes')
  @Public() // skip global JwtAuthGuard — secured by ApiKeyAuthGuard below
  @UseGuards(ApiKeyAuthGuard)
  creditMinutes(
    @Param('customerId') customerId: string,
    @Body() dto: CreditMinutesDto,
  ) {
    return this.walletService.creditMinutes(customerId, dto);
  }

  @Post(':customerId/debit-otc')
  @Public() // skip global JwtAuthGuard — secured by ApiKeyAuthGuard below
  @UseGuards(ApiKeyAuthGuard)
  debitOtc(@Param('customerId') customerId: string, @Body() dto: DebitOtcDto) {
    return this.walletService.debitOtc(customerId, dto);
  }

  @Get(':customerId/transactions')
  @Roles(Role.SUPER_ADMIN, Role.CUSTOMER)
  getTransactions(
    @Param('customerId') customerId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.assertCustomerAccess(user, customerId);
    return this.walletService.getTransactions(
      customerId,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 50,
    );
  }

  private assertCustomerAccess(user: AuthenticatedUser, customerId: string) {
    if (user.role === Role.SUPER_ADMIN) return;
    if (user.role !== Role.CUSTOMER || user.customerId !== customerId)
      throw new ForbiddenException('You cannot access another customer wallet');
  }
}
