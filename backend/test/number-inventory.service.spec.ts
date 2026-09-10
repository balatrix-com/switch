import { ConflictException, NotFoundException } from '@nestjs/common';
import { NumberInventoryStatus, Prisma } from '@prisma/client';
import { NumberInventoryService } from '../src/number-inventory/number-inventory.service';

describe('NumberInventoryService', () => {
  it('returns a useful 409 when the canonical number already exists', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on canonical_number',
      {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { target: ['canonical_number'] },
      },
    );
    const prisma = {
      globalNumberInventory: {
        create: jest.fn().mockRejectedValue(duplicate),
        findUnique: jest.fn().mockResolvedValue({
          id: 'inventory-id',
          canonicalNumber: '+14372905077',
          status: NumberInventoryStatus.AVAILABLE,
        }),
      },
    };
    const service = new NumberInventoryService(prisma as any, {} as any, {} as any);

    await expect(
      service.create({ canonicalNumber: '+14372905077' }),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({
        statusCode: 409,
        error: 'Conflict',
        message: 'Number already exists in global inventory',
        canonicalNumber: '+14372905077',
        existing: expect.objectContaining({ id: 'inventory-id' }),
      }),
    });
    expect(prisma.globalNumberInventory.findUnique).toHaveBeenCalledWith({
      where: { canonicalNumber: '+14372905077' },
      select: { id: true, canonicalNumber: true, status: true },
    });
  });

  it('does not hide unrelated database errors', async () => {
    const error = new Error('database unavailable');
    const prisma = {
      globalNumberInventory: {
        create: jest.fn().mockRejectedValue(error),
      },
    };
    const service = new NumberInventoryService(prisma as any, {} as any, {} as any);

    await expect(
      service.create({ canonicalNumber: '+14372905077' }),
    ).rejects.toBe(error);
  });

  it('successfully calls bswitchsub when assigning a number to a customer', async () => {
    const prisma: any = {
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cust-101', isActive: true }),
      },
      globalNumberInventory: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inv-101',
          canonicalNumber: '+18005550199',
          numberType: 'TFN',
          status: NumberInventoryStatus.AVAILABLE,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      customerNumber: {
        create: jest.fn().mockResolvedValue({
          id: 'cn-1',
          customerId: 'cust-101',
          inventoryId: 'inv-101',
          label: 'Support TFN',
        }),
      },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };

    const subscriptionClient = {
      assignNumberAsset: jest.fn().mockResolvedValue({
        success: true,
        number_asset_id: 'asset-uuid-1',
        asset: { id: 'asset-uuid-1', number: '+18005550199', status: 'assigned' },
      }),
      unassignNumberAsset: jest.fn(),
    };

    const service = new NumberInventoryService(prisma as any, {} as any, subscriptionClient as any);

    const result: any = await service.assign('inv-101', { customerId: 'cust-101', label: 'Support TFN' });

    expect(subscriptionClient.assignNumberAsset).toHaveBeenCalledWith({
      customer_id: 'cust-101',
      number: '+18005550199',
      number_type: 'TFN',
    });
    expect(result.id).toBe('cn-1');
    expect(result.assetSync.success).toBe(true);
    expect(subscriptionClient.unassignNumberAsset).not.toHaveBeenCalled();
  });

  it('fails assignment if customer has no available quota in bswitchsub', async () => {
    const prisma: any = {
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cust-102', isActive: true }),
      },
      globalNumberInventory: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inv-102',
          canonicalNumber: '+14155550122',
          numberType: 'DID',
          status: NumberInventoryStatus.AVAILABLE,
        }),
      },
      $transaction: jest.fn(),
    };

    const quotaError = new ConflictException('No active DID asset plan quota available for customer');
    const subscriptionClient = {
      assignNumberAsset: jest.fn().mockRejectedValue(quotaError),
      unassignNumberAsset: jest.fn(),
    };

    const service = new NumberInventoryService(prisma as any, {} as any, subscriptionClient as any);

    await expect(
      service.assign('inv-102', { customerId: 'cust-102' }),
    ).rejects.toThrow(ConflictException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('unassign releases the number in both switch and bswitchsub', async () => {
    const prisma: any = {
      customerNumber: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cn-2',
          customerId: 'cust-103',
          inventoryId: 'inv-103',
          inventory: { canonicalNumber: '+14155550199' },
          xml: { fileName: 'inbound_14155550199.xml' },
        }),
        delete: jest.fn().mockResolvedValue({ id: 'cn-2' }),
      },
      switchRoute: {
        count: jest.fn().mockResolvedValue(0),
      },
      globalNumberInventory: {
        update: jest.fn().mockResolvedValue({ id: 'inv-103', status: NumberInventoryStatus.AVAILABLE }),
      },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };

    const routeXml = {
      removeFile: jest.fn().mockResolvedValue(undefined),
    };

    const subscriptionClient = {
      unassignNumberAsset: jest.fn().mockResolvedValue({ success: true }),
    };

    const service = new NumberInventoryService(prisma as any, routeXml as any, subscriptionClient as any);

    await service.unassign('inv-103');

    expect(routeXml.removeFile).toHaveBeenCalledWith('inbound_14155550199.xml');
    expect(subscriptionClient.unassignNumberAsset).toHaveBeenCalledWith({
      customer_id: 'cust-103',
      number: '+14155550199',
    });
  });
});

