import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { ROLES_KEY } from '../src/auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { CustomersController } from '../src/customers/customers.controller';
import { CustomersService } from '../src/customers/customers.service';
import { SwitchRoutesController } from '../src/switch-routes/switch-routes.controller';

describe('tenant role isolation', () => {
  const context = (role: Role) => ({
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user: { role, customerId: role === Role.CUSTOMER ? '100001' : null } }) }),
  } as unknown as ExecutionContext);

  it('blocks customer users from super-admin APIs', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([Role.SUPER_ADMIN]) } as unknown as Reflector;
    expect(() => new RolesGuard(reflector).canActivate(context(Role.CUSTOMER))).toThrow('You do not have permission');
  });

  it('blocks Support Members from super-admin APIs', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([Role.SUPER_ADMIN]) } as unknown as Reflector;
    expect(() => new RolesGuard(reflector).canActivate(context(Role.SUPPORT_MEMBER))).toThrow('You do not have permission');
  });

  it('allows super admins through super-admin APIs', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([Role.SUPER_ADMIN]) } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(context(Role.SUPER_ADMIN))).toBe(true);
  });

  it('rejects customer attempts to assign outbound carriers through either settings endpoint', () => {
    const updateSettings = jest.fn();
    const controller = new CustomersController({ updateSettings } as unknown as CustomersService);
    const customer = {
      id: 'user-1',
      email: 'customer@example.com',
      name: 'Customer',
      role: Role.CUSTOMER,
      customerId: '100001',
    } satisfies AuthenticatedUser;
    const dto = { defaultOutboundCarrierId: '2d0e8b1d-55f2-4d45-9cf8-d91e6c59db3e' };

    expect(() => controller.updateSettings('100001', dto, customer)).toThrow(
      'Only Super Admin can assign outbound routing to a customer',
    );
    expect(() => controller.updateMySettings('100001', dto, customer)).toThrow(
      'Only Super Admin can assign outbound routing to a customer',
    );
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('keeps Super Admin outbound assignment available', () => {
    const updateSettings = jest.fn().mockReturnValue({ saved: true });
    const controller = new CustomersController({ updateSettings } as unknown as CustomersService);
    const admin = {
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: Role.SUPER_ADMIN,
      customerId: null,
    } satisfies AuthenticatedUser;
    const dto = { defaultOutboundCarrierEndpointId: '2d0e8b1d-55f2-4d45-9cf8-d91e6c59db3e' };

    expect(controller.updateSettings('100001', dto, admin)).toEqual({ saved: true });
    expect(updateSettings).toHaveBeenCalledWith('100001', dto);
  });

  it.each(['create', 'update', 'rebuild', 'remove'] as const)(
    'requires Super Admin for outbound route %s',
    (method) => {
      const handler = Object.getOwnPropertyDescriptor(
        SwitchRoutesController.prototype,
        method,
      )?.value as object;
      expect(
        Reflect.getMetadata(ROLES_KEY, handler),
      ).toEqual([Role.SUPER_ADMIN]);
    },
  );
});
