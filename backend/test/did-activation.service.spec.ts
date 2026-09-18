import { NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { CustomerNumberStatus, NumberInventoryStatus } from '@prisma/client';
import { DidActivationService, didActivationStatus } from '../src/did-activation/did-activation.service';
import { SubscriptionDidTokenGuard } from '../src/subscription/subscription-did-token.guard';

function fixture(assigned = true) {
  const inventory: any = {
    id: 'inventory-1', canonicalNumber: '+18005550123',
    status: assigned ? NumberInventoryStatus.ASSIGNED : NumberInventoryStatus.AVAILABLE,
    manuallyDisabled: false, subscriptionDisabled: false,
  };
  const assignment: any = assigned
    ? { id: 'customer-number-1', inventoryId: inventory.id, customerId: '100001', status: CustomerNumberStatus.ACTIVE }
    : null;
  const tx: any = {
    globalNumberInventory: {
      findUnique: jest.fn(async () => ({ ...inventory, assignment: assignment ? { ...assignment } : null })),
      update: jest.fn(async ({ data }) => Object.assign(inventory, data)),
    },
    customerNumber: {
      update: jest.fn(async ({ data }) => Object.assign(assignment, data)),
    },
  };
  const prisma: any = { $transaction: jest.fn(async (work) => work(tx)) };
  const didXml = { generate: jest.fn().mockResolvedValue({}) };
  const routeXml = { invalidateDid: jest.fn().mockResolvedValue(undefined) };
  const service = new DidActivationService(prisma, didXml as any, routeXml as any);
  return { inventory, assignment, tx, didXml, routeXml, service };
}

describe('DID activation sources', () => {
  it('disables an assigned DID for Super Admin and invalidates the live route', async () => {
    const { service, inventory, assignment, routeXml, didXml } = fixture();
    const result = await service.setActivation('inventory-1', 'admin', false);
    expect(inventory.manuallyDisabled).toBe(true);
    expect(inventory.subscriptionDisabled).toBe(false);
    expect(assignment.status).toBe(CustomerNumberStatus.SUSPENDED);
    expect(result.activationStatus).toBe('DISABLED_BY_ADMIN');
    expect(routeXml.invalidateDid).toHaveBeenCalledWith('100001', 'customer-number-1');
    expect(didXml.generate).not.toHaveBeenCalled();
  });

  it('keeps a subscription-disabled DID suspended when Super Admin re-enables their own toggle', async () => {
    const { service, inventory, assignment, didXml } = fixture();
    await service.setActivation('inventory-1', 'admin', false);
    await service.setActivation('inventory-1', 'subscription', false);
    const result = await service.setActivation('inventory-1', 'admin', true);
    expect(inventory.manuallyDisabled).toBe(false);
    expect(inventory.subscriptionDisabled).toBe(true);
    expect(assignment.status).toBe(CustomerNumberStatus.SUSPENDED);
    expect(result.activationStatus).toBe('DEACTIVATED_BY_SUBSCRIPTION');
    expect(didXml.generate).not.toHaveBeenCalled();
  });

  it('rebuilds the route only when the last disable source is cleared', async () => {
    const { service, inventory, assignment, didXml } = fixture();
    await service.setActivation('inventory-1', 'subscription', false);
    const result = await service.setActivation('inventory-1', 'subscription', true);
    expect(inventory.subscriptionDisabled).toBe(false);
    expect(assignment.status).toBe(CustomerNumberStatus.ACTIVE);
    expect(result.activationStatus).toBe('ACTIVE');
    expect(didXml.generate).toHaveBeenCalledWith('100001', 'customer-number-1');
  });

  it('can disable an unassigned DID without creating routing XML', async () => {
    const { service, inventory, routeXml, didXml } = fixture(false);
    const result = await service.setActivation('inventory-1', 'admin', false);
    expect(inventory.manuallyDisabled).toBe(true);
    expect(result.activationStatus).toBe('DISABLED_BY_ADMIN');
    expect(routeXml.invalidateDid).not.toHaveBeenCalled();
    expect(didXml.generate).not.toHaveBeenCalled();
  });

  it('does not let a missing inventory ID create a DID', async () => {
    const { service, tx } = fixture();
    tx.globalNumberInventory.findUnique.mockResolvedValue(null);
    await expect(service.setActivation('missing', 'admin', false)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('gives subscription deactivation precedence in the displayed state', () => {
    expect(didActivationStatus({ status: NumberInventoryStatus.ASSIGNED, manuallyDisabled: true, subscriptionDisabled: true })).toBe('DEACTIVATED_BY_SUBSCRIPTION');
  });
});

describe('Subscription DID API token', () => {
  const context = (token?: string) => ({ switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-subscription-did-token': token } }) }) }) as any;

  it('is unavailable until a real service token is configured', () => {
    const guard = new SubscriptionDidTokenGuard({ get: () => '' } as any);
    expect(() => guard.canActivate(context('anything'))).toThrow(ServiceUnavailableException);
  });

  it('rejects a missing or incorrect token', () => {
    const guard = new SubscriptionDidTokenGuard({ get: () => 'safe-secret' } as any);
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context('wrong'))).toThrow(UnauthorizedException);
  });

  it('accepts only the configured token', () => {
    const guard = new SubscriptionDidTokenGuard({ get: () => 'safe-secret' } as any);
    expect(guard.canActivate(context('safe-secret'))).toBe(true);
  });
});
