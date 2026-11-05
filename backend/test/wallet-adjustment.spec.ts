import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WalletService } from '../src/wallet/wallet.service';

describe('Wallet signed admin adjustment', () => {
  const wallet = { customerId: '230155', fiatBalance: new Prisma.Decimal(20), creditLimit: new Prisma.Decimal(0), didFreeMinutes: 30, obFreeMinutes: 10, currency: 'USD' };

  it('deducts cash and DID quota atomically and records the reason', async () => {
    const create = jest.fn().mockResolvedValue({});
    const tx = { $queryRaw: jest.fn(), customerWallet: { findUnique: jest.fn().mockResolvedValue(wallet), update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...wallet, fiatBalance: data.fiatBalance, didFreeMinutes: data.didFreeMinutes, obFreeMinutes: data.obFreeMinutes })) }, transaction: { create } };
    const prisma = { $transaction: (callback: (client: typeof tx) => unknown) => callback(tx) };
    const service = new WalletService(prisma as never);
    const updated = await service.adjustWallet(wallet.customerId, { fiat_delta: -5, did_minutes_delta: -7, reason: 'Manual MRC correction', adjustment_type: 'MRC' });
    expect(updated.fiatBalance.toString()).toBe('15');
    expect(updated.didFreeMinutes).toBe(23);
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ sourceType: 'mrc', fiatDebitAmount: new Prisma.Decimal(5), didMinuteDelta: -7, notes: 'Manual MRC correction' }) });
  });

  it('rejects quota deductions below zero', async () => {
    const tx = { $queryRaw: jest.fn(), customerWallet: { findUnique: jest.fn().mockResolvedValue(wallet), update: jest.fn() }, transaction: { create: jest.fn() } };
    const prisma = { $transaction: (callback: (client: typeof tx) => unknown) => callback(tx) };
    const service = new WalletService(prisma as never);
    await expect(service.adjustWallet(wallet.customerId, { did_minutes_delta: -31, reason: 'Correction' })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.customerWallet.update).not.toHaveBeenCalled();
  });
});
