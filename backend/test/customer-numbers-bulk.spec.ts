import { BadRequestException } from '@nestjs/common';
import { CustomerNumbersService } from '../src/customer-numbers/customer-numbers.service';
import { DidXmlGenerationService } from '../src/route-xml/did-xml-generation.service';

describe('CustomerNumbersService bulk settings', () => {
  it('refreshes billing cache when an existing DID card is saved again', async () => {
    const settings = { providerRateCardId: 'card-1' };
    const prisma = {
      customerNumber: {
        findFirst: jest.fn().mockResolvedValue({ id: 'number-1', settings }),
      },
      rateCard: {
        findFirst: jest.fn().mockResolvedValue({ id: 'card-1' }),
      },
      numberSettings: {
        upsert: jest.fn().mockResolvedValue(settings),
      },
    };
    const didXml = { generate: jest.fn().mockResolvedValue({ id: 'xml-1' }) };
    const billing = { refreshCache: jest.fn().mockResolvedValue({ status: 'success' }) };
    const service = new CustomerNumbersService(prisma as any, didXml as any, billing as any);

    await expect(service.updateSettings('customer-1', 'number-1', settings))
      .resolves.toEqual({ settings, xml: { id: 'xml-1' }, cacheRefresh: { status: 'success' } });
    expect(billing.refreshCache).toHaveBeenCalledTimes(1);
  });

  it('rejects number IDs not owned by the customer', async () => {
    const prisma = {
      customerNumber: {
        findMany: jest.fn().mockResolvedValue([{ id: 'id-1' }]),
      },
    };
    const service = new CustomerNumbersService(prisma as any, {} as any, {} as any);
    await expect(
      service.bulkUpdateSettings('customer-1', {
        customerNumberIds: ['id-1', 'id-2'],
        settings: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('upserts every number and generates database-only XML as one batch', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = {
      customerNumber: {
        findMany: jest.fn().mockResolvedValue([{ id: 'id-1' }, { id: 'id-2' }]),
      },
      numberSettings: { upsert },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const didXml = {
      generateBulk: jest.fn().mockResolvedValue({ generated: 2, failed: [] }),
    };
    const service = new CustomerNumbersService(prisma as any, didXml as any, {} as any);
    await expect(
      service.bulkUpdateSettings('customer-1', {
        customerNumberIds: ['id-1', 'id-2'],
        settings: {
          callerIdMode: 'ANONYMOUS' as any,
          recordingEnabled: false,
        },
      }),
    ).resolves.toEqual({ updated: 2, failed: [], cacheRefresh: null });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        update: expect.objectContaining({ recordingEnabled: false }),
      }),
    );
    expect(upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        update: expect.objectContaining({ recordingEnabled: false }),
      }),
    );
    expect(didXml.generateBulk).toHaveBeenCalledTimes(1);
    expect(didXml.generateBulk).toHaveBeenCalledWith(
      'customer-1',
      ['id-1', 'id-2'],
      { dbOnly: true },
    );
  });
});

describe('DidXmlGenerationService bulk cache behavior', () => {
  it('skips per-number flushes and flushes once after the batch', async () => {
    const xmlStorage = {
      removeFileAndMaybeFlush: jest.fn().mockResolvedValue(undefined),
    };
    const service = new DidXmlGenerationService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      xmlStorage as any,
    );
    const generateSpy = jest
      .spyOn(service, 'generate')
      .mockResolvedValue({} as any);

    await service.generateBulk('customer-1', ['id-1', 'id-2'], {
      dbOnly: true,
    });

    expect(generateSpy).toHaveBeenNthCalledWith(1, 'customer-1', 'id-1', {
      dbOnly: true,
      skipFlush: true,
    });
    expect(generateSpy).toHaveBeenNthCalledWith(2, 'customer-1', 'id-2', {
      dbOnly: true,
      skipFlush: true,
    });
    expect(xmlStorage.removeFileAndMaybeFlush).toHaveBeenCalledTimes(1);
    expect(xmlStorage.removeFileAndMaybeFlush).toHaveBeenCalledWith(null, true);
  });
});
