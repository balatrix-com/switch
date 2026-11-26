import { Prisma } from '@prisma/client';
import { WalletService } from './wallet.service';

const dec = (value: string) => new Prisma.Decimal(value);

describe('WalletService debt repayment', () => {
  function setup(cash: string, debt: string) {
    const current = {
      customerId: '482692', currency: 'USD', fiatBalance: dec(cash),
      creditUsed: dec(debt), creditLimit: dec('0'),
      didFreeMinutes: 0, obFreeMinutes: 0,
    };
    const created: Array<Record<string, unknown>> = [];
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'wallet-id' }]),
      customerWallet: {
        findUnique: jest.fn().mockResolvedValue(current),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({
          ...current, fiatBalance: data.fiatBalance,
          creditUsed: data.creditUsed,
        })),
      },
      transaction: { create: jest.fn().mockImplementation(({ data }) => {
        created.push(data);
        return Promise.resolve(data);
      }) },
    };
    const prisma = { $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) };
    return { service: new WalletService(prisma as never), tx, created };
  }

  it('repays old debt from a top-up and records both movements', async () => {
    const { service, created } = setup('1.35', '6.31');
    const wallet = await service.adjustWallet('482692', { topup_amount: 50 });
    expect(wallet.fiatBalance.toString()).toBe('45.04');
    expect(wallet.creditUsed.toString()).toBe('0');
    expect(created.map((entry) => entry.sourceType)).toEqual(['topup', 'credit_repayment']);
    expect((created[0].fiatDebitAmount as Prisma.Decimal).toString()).toBe('-50');
    expect((created[1].fiatDebitAmount as Prisma.Decimal).toString()).toBe('6.31');
    expect((created[1].creditDebitAmount as Prisma.Decimal).toString()).toBe('-6.31');
  });

  it('leaves residual debt when a top-up is smaller than the debt', async () => {
    const { service, created } = setup('0', '6.31');
    const wallet = await service.topUp('482692', { amount: 2 });
    expect(wallet.fiatBalance.toString()).toBe('0');
    expect(wallet.creditUsed.toString()).toBe('4.31');
    expect(created.map((entry) => entry.sourceType)).toEqual(['topup', 'credit_repayment']);
  });

  it('does not create a repayment entry when no debt exists', async () => {
    const { service, created } = setup('1.35', '0');
    const wallet = await service.topUp('482692', { amount: 50 });
    expect(wallet.fiatBalance.toString()).toBe('51.35');
    expect(created.map((entry) => entry.sourceType)).toEqual(['topup']);
  });
});
