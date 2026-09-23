import { CustomerNumbersService } from '../src/customer-numbers/customer-numbers.service';
import { CustomersService } from '../src/customers/customers.service';

describe('monitor extension DID isolation', () => {
  it('rejects a monitor as a number target', async () => {
    const prisma = {
      sipUser: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'monitor', isMonitor: true }),
      },
    };
    const service = new CustomerNumbersService(prisma as any, {} as any);
    jest.spyOn(service, 'findOne').mockResolvedValue({} as any);
    await expect(
      service.updateSettings('cust-1', 'number-1', {
        targetSipUserId: 'monitor',
      }),
    ).rejects.toThrow(
      'A monitoring extension cannot be assigned as a DID routing destination',
    );
  });

  it('rejects a monitor as the customer default target', async () => {
    const prisma = {
      sipUser: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'monitor', isMonitor: true }),
      },
    };
    const service = new CustomersService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(service, 'findOne').mockResolvedValue({} as any);
    await expect(
      service.updateSettings('cust-1', { defaultTargetSipUserId: 'monitor' }),
    ).rejects.toThrow(
      'A monitoring extension cannot be assigned as a DID routing destination',
    );
  });
});
