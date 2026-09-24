import { UnauthorizedException } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../src/auth/auth.service';
import { CustomersService } from '../src/customers/customers.service';

describe('AuthService', () => {
  const password = 'ValidPass123';
  let passwordHash: string;

  beforeAll(async () => { passwordHash = await bcrypt.hash(password, 4); });

  it('returns a signed token for valid active credentials', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 'user@example.com', passwordHash, name: 'User', role: Role.CUSTOMER, status: UserStatus.ACTIVE, customerId: '100001', customer: { id: '100001', isActive: true } }) } };
    const jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt') };
    const service = new AuthService(prisma as any, jwt as any);
    await expect(service.login({ email: ' USER@example.com ', password })).resolves.toMatchObject({ accessToken: 'signed.jwt', user: { email: 'user@example.com', customerId: '100001' } });
    expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ sub: 'u1', role: Role.CUSTOMER }));
  });

  it.each([
    ['wrong password', { email: 'user@example.com', password: 'wrong' }, true],
    ['unknown email', { email: 'missing@example.com', password }, false],
  ])('rejects %s', async (_label, dto, existing) => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(existing ? { id: 'u1', email: 'user@example.com', passwordHash, name: null, role: Role.CUSTOMER, status: UserStatus.ACTIVE, customerId: '100001', customer: { isActive: true } } : null) } };
    const service = new AuthService(prisma as any, { signAsync: jest.fn() } as any);
    await expect(service.login(dto)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logs in a Support Member with active assigned customers', async () => {
    const customer = { id: '100001', name: 'Acme', accountCode: 'ACME', isActive: true };
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u2', email: 'staff@example.com', passwordHash, name: 'Staff', role: Role.SUPPORT_MEMBER, status: UserStatus.ACTIVE, customerId: null, customer: null, supportAssignments: [{ customer }] }) } };
    const jwt = { signAsync: jest.fn().mockResolvedValue('support.jwt') };
    const result = await new AuthService(prisma as any, jwt as any).login({ email: 'staff@example.com', password });
    expect(result.user.supportCustomers).toEqual([customer]);
    expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ role: Role.SUPPORT_MEMBER, customerId: null }));
  });
});

describe('customer provisioning', () => {
  it('creates the customer and a tenant user with a password hash in one transaction', async () => {
    const tx = {
      customer: { create: jest.fn().mockResolvedValue({ id: '100001', name: 'Acme', accountCode: 'ACME', settings: {} }) },
      user: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'u1', email: data.email, role: data.role, customerId: data.customerId })) },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      customerWallet: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const zeptoMail = { sendUserCredentials: jest.fn().mockResolvedValue({ status: 'SENT' }) };
    const service = new CustomersService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, zeptoMail as any);
    const result = await service.create({ name: 'Acme', accountCode: 'ACME', adminEmail: 'OWNER@EXAMPLE.COM', adminPassword: 'Secret123', contactName: 'Owner' });
    const data = tx.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ email: 'owner@example.com', role: Role.CUSTOMER, customerId: '100001', name: 'Owner' });
    expect(data.passwordHash).not.toBe('Secret123');
    expect(zeptoMail.sendUserCredentials).toHaveBeenCalledWith({
      email: 'owner@example.com',
      password: 'Secret123',
      name: 'Owner',
      role: 'CUSTOMER',
      customerId: '100001',
    });
    expect(result).not.toHaveProperty('credentialEmail');
  });
});
