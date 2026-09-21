import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { WalletsService } from './wallets.service';
import {
  AdjustWalletDto,
  AssignNumberAssetDto,
  CreateCustomerWalletDto,
  DeductWalletDto,
} from './dto/wallet.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('wallets')
@Controller('wallets')
@Roles(Role.SUPER_ADMIN)
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get(':customer_id')
  @ApiOperation({ summary: 'Get multi-bucket wallet balance for a customer' })
  getWallet(@Param('customer_id') customerId: string) {
    return this.walletsService.getWallet(customerId);
  }

  @Post('customer')
  @ApiOperation({
    summary: 'Initialize a customer wallet with fiat and minute pockets',
  })
  createWallet(@Body() dto: CreateCustomerWalletDto) {
    return this.walletsService.createWallet(dto);
  }

  @Patch(':customer_id')
  @ApiOperation({
    summary: 'Adjust or top-up customer fiat balance or free minute allowances',
  })
  adjustWallet(
    @Param('customer_id') customerId: string,
    @Body() dto: AdjustWalletDto,
  ) {
    return this.walletsService.adjustWallet(customerId, dto);
  }

  @Post('deduct')
  @ApiOperation({
    summary: 'Deduct usage from free minute buckets or fiat balance',
  })
  deduct(@Body() dto: DeductWalletDto) {
    return this.walletsService.deduct(dto);
  }
}

@ApiTags('assets')
@Controller('number_assigning')
@Roles(Role.SUPER_ADMIN)
export class NumberAssigningController {
  constructor(private readonly walletsService: WalletsService) {}

  @Post()
  @ApiOperation({
    summary: 'Assign a phone number asset and update quota tracking',
  })
  assignNumber(@Body() dto: AssignNumberAssetDto) {
    return this.walletsService.assignNumber(dto);
  }
}
