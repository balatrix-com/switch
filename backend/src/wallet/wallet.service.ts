import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TopUpWalletDto, CreditMinutesDto, DebitOtcDto } from './dto/wallet.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  async getWallet(customerId: string) {
    const wallet = await this.prisma.customerWallet.findUnique({
      where: { customerId },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  async getAllWallets() {
    return this.prisma.customerWallet.findMany({
      include: {
        customer: {
          select: { name: true, accountCode: true },
        },
      },
    });
  }

  async topUp(customerId: string, dto: TopUpWalletDto) {
    const wallet = await this.prisma.customerWallet.update({
      where: { customerId },
      data: {
        fiatBalance: { increment: dto.amount },
        version: { increment: 1 },
      },
    });

    await this.prisma.transaction.create({
      data: {
        customerId,
        sourceType: 'topup',
        currency: wallet.currency,
        fiatDebitAmount: new Prisma.Decimal(-dto.amount), // negative for credit
        balanceAfter: wallet.fiatBalance,
        status: 'posted',
        notes: `Manual top up of ${dto.amount}`,
      },
    });

    return wallet;
  }

  async creditMinutes(customerId: string, dto: CreditMinutesDto) {
    const updateData: any = { version: { increment: 1 } };
    let notes = [];

    if (dto.tfn_free_minutes) {
      updateData.tfnFreeMinutes = { increment: dto.tfn_free_minutes };
      notes.push(`+${dto.tfn_free_minutes} TFN mins`);
    }
    if (dto.did_free_minutes) {
      updateData.didFreeMinutes = { increment: dto.did_free_minutes };
      notes.push(`+${dto.did_free_minutes} DID mins`);
    }
    if (dto.ob_free_minutes) {
      updateData.obFreeMinutes = { increment: dto.ob_free_minutes };
      notes.push(`+${dto.ob_free_minutes} OB mins`);
    }

    if (Object.keys(updateData).length === 1) { // only version
      return this.getWallet(customerId);
    }

    const wallet = await this.prisma.customerWallet.update({
      where: { customerId },
      data: updateData,
    });

    await this.prisma.transaction.create({
      data: {
        customerId,
        sourceType: 'subscription',
        currency: wallet.currency,
        balanceAfter: wallet.fiatBalance,
        status: 'posted',
        notes: notes.join(', '),
      },
    });

    return wallet;
  }

  async debitOtc(customerId: string, dto: DebitOtcDto) {
    const wallet = await this.getWallet(customerId);
    
    // Debit logic similar to CDR rating, but simpler. For OTC, we debit fiatBalance.
    // Allow negative for now (no hard stop implemented per user preference).
    
    const updatedWallet = await this.prisma.customerWallet.update({
      where: { customerId },
      data: {
        fiatBalance: { decrement: dto.amount },
        version: { increment: 1 },
      },
    });

    await this.prisma.transaction.create({
      data: {
        customerId,
        sourceType: 'otc',
        sourceRef: dto.plan_id,
        currency: wallet.currency,
        fiatDebitAmount: new Prisma.Decimal(dto.amount),
        balanceAfter: updatedWallet.fiatBalance,
        status: 'posted',
        notes: `OTC charge for plan ${dto.plan_name || dto.plan_id}`,
      },
    });

    return updatedWallet;
  }

  async getTransactions(customerId: string, page = 1, pageSize = 50) {
    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.transaction.count({
        where: { customerId },
      })
    ]);

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      }
    };
  }
}
