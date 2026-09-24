import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ROLES_KEY } from '../src/auth/decorators/roles.decorator';
import { CustomersController } from '../src/customers/customers.controller';
import { CustomersService } from '../src/customers/customers.service';

describe('deferred customer credential email', () => {
  const password = 'CustomerSecret123';
  let passwordHash: string;
  let prisma: {
    customer: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock };
  };
  let zeptoMail: { sendUserCredentials: jest.Mock };
  let service: CustomersService;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(password, 4);
  });

  beforeEach(() => {
    prisma = {
      customer: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: '100001', name: 'Acme' }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          email: 'owner@example.com',
          name: 'Owner',
          passwordHash,
        }),
      },
    };
    zeptoMail = {
      sendUserCredentials: jest.fn().mockResolvedValue({ status: 'SENT' }),
    };
    service = new CustomersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      zeptoMail as never,
    );
  });

  it('sends the verified login credentials to the active customer administrator', async () => {
    await expect(
      service.sendCredentials('100001', { password }),
    ).resolves.toEqual({
      status: 'SENT',
      email: 'owner@example.com',
      credentialEmail: { status: 'SENT' },
    });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        customerId: '100001',
        role: Role.CUSTOMER,
        status: UserStatus.ACTIVE,
      },
      select: { email: true, name: true, passwordHash: true },
    });
    expect(zeptoMail.sendUserCredentials).toHaveBeenCalledWith({
      email: 'owner@example.com',
      password,
      name: 'Owner',
      role: 'CUSTOMER',
      customerId: '100001',
    });
  });

  it('rejects a password that does not match the stored hash', async () => {
    await expect(
      service.sendCredentials('100001', { password: 'WrongPassword' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(zeptoMail.sendUserCredentials).not.toHaveBeenCalled();
  });

  it('rejects a missing customer', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);

    await expect(
      service.sendCredentials('missing', { password }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(zeptoMail.sendUserCredentials).not.toHaveBeenCalled();
  });

  it('rejects a customer without an active administrator', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.sendCredentials('100001', { password }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(zeptoMail.sendUserCredentials).not.toHaveBeenCalled();
  });

  it.each(['FAILED', 'SKIPPED'] as const)(
    'returns %s without changing or deleting the customer',
    async (status) => {
      zeptoMail.sendUserCredentials.mockResolvedValue({ status });

      await expect(
        service.sendCredentials('100001', { password }),
      ).resolves.toEqual({
        status,
        email: 'owner@example.com',
        credentialEmail: { status },
      });
      expect(prisma.customer).not.toHaveProperty('delete');
    },
  );

  it('protects the delivery endpoint with the Super Admin role', () => {
    // Metadata is attached to the prototype method itself; the test does not invoke it.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const handler = CustomersController.prototype.sendCredentials;
    expect(
      Reflect.getMetadata(ROLES_KEY, handler),
    ).toEqual([Role.SUPER_ADMIN]);
  });
});
