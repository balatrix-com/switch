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

    if (dto.tfn_free_minutes) throw new BadRequestException('Use did_free_minutes for all inbound DID minutes');
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
        tfnMinuteDelta: 0,
        didMinuteDelta: dto.did_free_minutes || 0,
        obMinuteDelta: dto.ob_free_minutes || 0,
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
    page = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    pageSize = Number.isFinite(pageSize) ? Math.min(100, Math.max(1, Math.floor(pageSize))) : 50;
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
      data: data.map((transaction) => ({ ...transaction, id: transaction.id.toString() })),
      pagination: {
        page,
        pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      }
    };
  }
  async adjustWallet(customerId: string, dto: {
    topup_amount?: number;
    fiat_balance?: number;
    fiat_delta?: number;
    credit_limit?: number;
    tfn_free_minutes?: number;
    did_free_minutes?: number;
    ob_free_minutes?: number;
    did_minutes_delta?: number;
    ob_minutes_delta?: number;
    reason?: string;
    adjustment_type?: 'MRC' | 'OTC' | 'OTHER';
  }) {
    const signed = [dto.fiat_delta, dto.did_minutes_delta, dto.ob_minutes_delta].some((value) => value !== undefined);
    if (signed && !dto.reason?.trim()) throw new BadRequestException('A reason is required for signed adjustments');
    if (dto.fiat_delta !== undefined && (dto.fiat_balance !== undefined || dto.topup_amount !== undefined))
      throw new BadRequestException('Choose either fiat_delta, fiat_balance, or topup_amount');
    if (dto.did_minutes_delta !== undefined && dto.did_free_minutes !== undefined)
      throw new BadRequestException('Choose either did_minutes_delta or did_free_minutes');
    if (dto.ob_minutes_delta !== undefined && dto.ob_free_minutes !== undefined)
      throw new BadRequestException('Choose either ob_minutes_delta or ob_free_minutes');
    if (dto.topup_amount !== undefined && dto.topup_amount <= 0) throw new BadRequestException('Top-up must be positive');
    if (dto.tfn_free_minutes !== undefined && dto.tfn_free_minutes !== 0)
      throw new BadRequestException('Use DID minutes for all inbound calls');
    for (const value of [dto.did_minutes_delta, dto.ob_minutes_delta, dto.did_free_minutes, dto.ob_free_minutes]) {
      if (value !== undefined && !Number.isInteger(value)) throw new BadRequestException('Minute adjustments must be whole numbers');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customer_wallets WHERE customer_id = ${customerId} FOR UPDATE`;
      const wallet = await tx.customerWallet.findUnique({ where: { customerId } });
      if (!wallet) throw new NotFoundException(`Wallet not found for customer ${customerId}`);
      const cash = dto.fiat_delta !== undefined ? wallet.fiatBalance.plus(dto.fiat_delta)
        : dto.topup_amount !== undefined ? wallet.fiatBalance.plus(dto.topup_amount)
        : dto.fiat_balance !== undefined ? new Prisma.Decimal(dto.fiat_balance) : wallet.fiatBalance;
      if ((dto.adjustment_type === 'MRC' || dto.adjustment_type === 'OTC') && !cash.lessThan(wallet.fiatBalance))
        throw new BadRequestException('MRC/OTC charge type requires a cash deduction');
      const did = dto.did_minutes_delta !== undefined ? wallet.didFreeMinutes + dto.did_minutes_delta : dto.did_free_minutes ?? wallet.didFreeMinutes;
      const ob = dto.ob_minutes_delta !== undefined ? wallet.obFreeMinutes + dto.ob_minutes_delta : dto.ob_free_minutes ?? wallet.obFreeMinutes;
      if (did < 0 || ob < 0) throw new BadRequestException('Minute quota cannot fall below zero');
      const updated = await tx.customerWallet.update({ where: { customerId }, data: {
        fiatBalance: cash, didFreeMinutes: did, obFreeMinutes: ob,
        ...(dto.credit_limit !== undefined ? { creditLimit: new Prisma.Decimal(dto.credit_limit) } : {}),
        version: { increment: 1 },
      } });
      await tx.transaction.create({ data: {
        customerId,
        sourceType: dto.adjustment_type === 'MRC' ? 'mrc' : dto.adjustment_type === 'OTC' ? 'otc' : 'adjustment',
        tfnMinuteDelta: 0,
        didMinuteDelta: did - wallet.didFreeMinutes,
        obMinuteDelta: ob - wallet.obFreeMinutes,
        currency: updated.currency,
        fiatDebitAmount: wallet.fiatBalance.minus(cash),
        balanceAfter: updated.fiatBalance,
        status: 'posted',
        notes: dto.reason?.trim() || (dto.topup_amount ? `Wallet top-up of ${dto.topup_amount}` : 'Admin balance/quota override'),
      } });
      return updated;
    });
  }

  async upsertWallet(customerId: string, params: {
    fiat_balance: number;
    credit_limit?: number;
    currency: string;
  }) {
    const existing = await this.prisma.customerWallet.findUnique({ where: { customerId } });
    if (existing) return existing;

    return this.prisma.customerWallet.create({
      data: {
        customerId,
        fiatBalance: params.fiat_balance,
        creditLimit: params.credit_limit ?? params.fiat_balance,
        currency: params.currency.toUpperCase(),
      },
    });
  }

  async deductUsage(customerId: string, dto: {
    usage_type: string;
    duration_seconds?: number;
    amount?: number;
  }) {
     let updateData: Prisma.CustomerWalletUpdateInput = { version: { increment: 1 } };
     if (dto.usage_type === 'TFN' || dto.usage_type === 'DID') updateData.didFreeMinutes = { decrement: dto.duration_seconds || 1 };
     else if (dto.usage_type === 'OB') updateData.obFreeMinutes = { decrement: dto.duration_seconds || 1 };
     
     if (dto.amount) {
       updateData.fiatBalance = { decrement: new Prisma.Decimal(dto.amount) };
     }

     const updated = await this.prisma.customerWallet.update({
       where: { customerId },
       data: updateData
     });
     return updated;
  }
}
