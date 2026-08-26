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
    const service = new NumberInventoryService(prisma as any, {} as any);

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
    const service = new NumberInventoryService(prisma as any, {} as any);

    await expect(
      service.create({ canonicalNumber: '+14372905077' }),
    ).rejects.toBe(error);
  });
});
