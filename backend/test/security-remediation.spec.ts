import {
  ExecutionContext,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { ApiKeyAuthGuard } from '../src/common/guards/api-key.guard';
import { ROLES_KEY } from '../src/auth/decorators/roles.decorator';
import { WalletController } from '../src/wallet/wallet.controller';
import { PlansController } from '../src/subscription/plans.controller';
import {
  NumberAssigningController,
  WalletsController,
} from '../src/subscription/wallets.controller';
import { AuthenticatedUser } from '../src/auth/auth.types';

const contextWithApiKey = (apiKey?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'x-api-key': apiKey } }),
    }),
  }) as unknown as ExecutionContext;

describe('Security remediation boundaries', () => {
  describe('ApiKeyAuthGuard', () => {
    it('fails closed when SWITCH_API_KEY is missing', () => {
      const guard = new ApiKeyAuthGuard({
        get: jest.fn(() => undefined),
      } as unknown as ConfigService);

      expect(() => guard.canActivate(contextWithApiKey('anything'))).toThrow(
        ServiceUnavailableException,
      );
    });

    it('rejects an invalid key and accepts the configured key', () => {
      const guard = new ApiKeyAuthGuard({
        get: jest.fn(() => 'configured-secret'),
      } as unknown as ConfigService);

      expect(() =>
        guard.canActivate(contextWithApiKey('wrong-secret')),
      ).toThrow(UnauthorizedException);
      expect(guard.canActivate(contextWithApiKey('configured-secret'))).toBe(
        true,
      );
    });
  });

  describe('wallet tenant isolation', () => {
    const walletService = {
      getWallet: jest.fn(),
      getTransactions: jest.fn(),
    };
    const controller = new WalletController(walletService as never);
    const customer: AuthenticatedUser = {
      id: 'user-1',
      email: 'customer@example.com',
      name: null,
      role: Role.CUSTOMER,
      customerId: 'customer-1',
    };

    it('rejects customer access to another wallet', () => {
      expect(() => controller.getWallet('customer-2', customer)).toThrow(
        ForbiddenException,
      );
      expect(() => controller.getTransactions('customer-2', customer)).toThrow(
        ForbiddenException,
      );
    });

    it('marks wallet listing and top-up as Super Admin only', () => {
      expect(
        // Metadata is attached to the controller method function by @Roles.
        Reflect.getMetadata(
          ROLES_KEY,
          // eslint-disable-next-line @typescript-eslint/unbound-method
          WalletController.prototype.getAllWallets,
        ),
      ).toEqual([Role.SUPER_ADMIN]);
      expect(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        Reflect.getMetadata(ROLES_KEY, WalletController.prototype.topUpWallet),
      ).toEqual([Role.SUPER_ADMIN]);
    });
  });

  describe('subscription gateway authorization', () => {
    const plansService = { subscribe: jest.fn() };
    const controller = new PlansController(plansService as never);
    const customer: AuthenticatedUser = {
      id: 'user-1',
      email: 'customer@example.com',
      name: null,
      role: Role.CUSTOMER,
      customerId: 'customer-1',
    };

    it('rejects subscribing another customer or overriding balance checks', () => {
      expect(() =>
        controller.subscribe(
          { customer_id: 'customer-2', plan_id: 'plan-1' },
          customer,
        ),
      ).toThrow(ForbiddenException);
      expect(() =>
        controller.subscribe(
          {
            customer_id: 'customer-1',
            plan_id: 'plan-1',
            override_balance_check: true,
          },
          customer,
        ),
      ).toThrow(ForbiddenException);
    });

    it('subscribes a customer only with its JWT tenant and no override', async () => {
      await controller.subscribe(
        { customer_id: 'customer-1', plan_id: 'plan-1' },
        customer,
      );

      expect(plansService.subscribe).toHaveBeenLastCalledWith({
        customer_id: 'customer-1',
        plan_id: 'plan-1',
        override_balance_check: false,
      });
    });

    it('marks catalog mutations and subscription wallet APIs as admin-only', () => {
      for (const method of ['create', 'update', 'remove'] as const) {
        expect(
          // eslint-disable-next-line @typescript-eslint/unbound-method
          Reflect.getMetadata(ROLES_KEY, PlansController.prototype[method]),
        ).toEqual([Role.SUPER_ADMIN]);
      }
      expect(Reflect.getMetadata(ROLES_KEY, WalletsController)).toEqual([
        Role.SUPER_ADMIN,
      ]);
      expect(Reflect.getMetadata(ROLES_KEY, NumberAssigningController)).toEqual(
        [Role.SUPER_ADMIN],
      );
    });
  });
});
