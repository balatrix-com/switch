import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { SupportMembersService } from '../src/support-members/support-members.service';
import { SupportAccessGuard } from '../src/auth/guards/support-access.guard';

describe('Support Member management', () => {
  it('creates an unscoped staff login with a hashed password and initial assignment', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'u1', email: data.email, role: data.role })) },
      customer: { findUnique: jest.fn().mockResolvedValue({ isActive: true }) },
    };
    const zeptoMail = { sendUserCredentials: jest.fn().mockResolvedValue({ status: 'SENT' }) };
    const service = new SupportMembersService(prisma as any, zeptoMail as any);
    const result = await service.create({ email: ' STAFF@EXAMPLE.COM ', password: 'SupportPass123', name: 'Staff', customerId: '100001' });
    expect(result).toMatchObject({ email: 'staff@example.com', role: Role.SUPPORT_MEMBER });
    const data = (prisma.user.create.mock.calls[0] as any)[0].data;
    expect(data).toMatchObject({ customerId: null, supportAssignments: { create: { customerId: '100001' } } });
    expect(data.passwordHash).not.toBe('SupportPass123');
    await expect(bcrypt.compare('SupportPass123', data.passwordHash)).resolves.toBe(true);
    expect(zeptoMail.sendUserCredentials).toHaveBeenCalledWith({ email: 'staff@example.com', password: 'SupportPass123', name: 'Staff', role: 'SUPPORT_MEMBER', customerId: '100001' });
    expect(result).toMatchObject({ credentialEmail: { status: 'SENT' } });
  });

  it('rejects duplicate assignment', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }) },
      customer: { findUnique: jest.fn().mockResolvedValue({ isActive: true }) },
      supportAssignment: { findUnique: jest.fn().mockResolvedValue({ supportMemberId: 'u1' }) },
    };
    await expect(new SupportMembersService(prisma as any, {} as any).assign('u1', { customerId: '100001' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('soft-deletes a member and clears assignments', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }), update: jest.fn().mockReturnValue(Promise.resolve()) },
      supportAssignment: { deleteMany: jest.fn().mockReturnValue(Promise.resolve()) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    await new SupportMembersService(prisma as any, {} as any).remove('u1');
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { status: UserStatus.DELETED } });
    expect(prisma.supportAssignment.deleteMany).toHaveBeenCalledWith({ where: { supportMemberId: 'u1' } });
  });

  it('lists only support members assigned exclusively to this tenant', async () => {
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([]) } };
    await new SupportMembersService(prisma as any, {} as any).listForCustomer('100001');
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ supportAssignments: { some: { customerId: '100001' }, every: { customerId: '100001' } } }),
    }));
  });

  it('does not let a tenant manage another or shared support account', async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ supportAssignments: [{ customerId: '100001' }, { customerId: '200002' }] }) } };
    const service = new SupportMembersService(prisma as any, {} as any);
    await expect(service.assertExclusiveCustomerMember('u1', '100001')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SupportAccessGuard', () => {
  const context = (role: Role) => ({ switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }), getHandler: () => ({}), getClass: () => ({}) }) as any;

  it('defaults to deny for Support Members', () => {
    const guard = new SupportAccessGuard({ getAllAndOverride: () => undefined } as any);
    expect(() => guard.canActivate(context(Role.SUPPORT_MEMBER))).toThrow(ForbiddenException);
  });

  it('permits explicitly opted-in customer APIs', () => {
    const guard = new SupportAccessGuard({ getAllAndOverride: () => true } as any);
    expect(guard.canActivate(context(Role.SUPPORT_MEMBER))).toBe(true);
  });
});
