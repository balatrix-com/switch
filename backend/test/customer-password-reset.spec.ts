import { NotFoundException } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ROLES_KEY } from '../src/auth/decorators/roles.decorator';
import { CustomersController } from '../src/customers/customers.controller';
import { CustomersService } from '../src/customers/customers.service';

describe('SuperAdmin tenant password reset', () => {
  const customer = { id: '482692', name: 'Example tenant' };
  const user = { id: 'tenant-user', email: 'admin@example.com', name: 'Tenant Admin' };
  const prisma = {
    customer: { findUnique: jest.fn() },
    user: { findFirst: jest.fn(), update: jest.fn() },
  };
  const service = new CustomersService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.customer.findUnique.mockResolvedValue(customer);
    prisma.user.findFirst.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue({});
  });

  it('restricts both login lookup and reset endpoints to SuperAdmin', () => {
    expect(Reflect.getMetadata(ROLES_KEY, CustomersController.prototype.loginAccount)).toEqual([Role.SUPER_ADMIN]);
    expect(Reflect.getMetadata(ROLES_KEY, CustomersController.prototype.resetPassword)).toEqual([Role.SUPER_ADMIN]);
  });

  it('sets a hashed password without checking the old password or exposing the new one', async () => {
    const result = await service.resetPassword(customer.id, { newPassword: 'NewSecret123!' }, 'superadmin-1');
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { customerId: customer.id, role: Role.CUSTOMER, status: UserStatus.ACTIVE },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, name: true },
    });
    const update = prisma.user.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: user.id });
    expect(await bcrypt.compare('NewSecret123!', update.data.passwordHash)).toBe(true);
    expect(result).toEqual({ changed: true, email: user.email });
    expect(JSON.stringify(result)).not.toContain('NewSecret123!');
  });

  it('rejects a customer without an active tenant login', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.resetPassword(customer.id, { newPassword: 'NewSecret123!' }, 'superadmin-1'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
