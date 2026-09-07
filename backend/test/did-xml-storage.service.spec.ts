import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RouteXmlService } from '../src/route-xml/route-xml.service';

describe('RouteXmlService DID file storage', () => {
  let outputDirectory: string;

  afterEach(async () => {
    if (outputDirectory) {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });

  it('writes the generated XML under the canonical inbound DID key', async () => {
    outputDirectory = await mkdtemp(join(tmpdir(), 'billing-switch-xml-'));
    const prisma = {
      routeXml: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'xml-id', version: 1 }),
      },
    };
    const config = {
      get: jest.fn().mockReturnValue(outputDirectory),
    } as unknown as ConfigService;
    const service = new RouteXmlService(prisma as any, config);
    const xml = '<document type="freeswitch/xml" />';

    await service.materializeDid(
      'customer-id',
      'customer-number-id',
      '8005551234',
      xml,
    );

    await expect(
      readFile(join(outputDirectory, 'inbound_8005551234.xml'), 'utf8'),
    ).resolves.toBe(xml);
    expect(prisma.routeXml.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerNumberId: 'customer-number-id' },
      }),
    );
  });

  it('writes generated outbound route XML under its route ID', async () => {
    outputDirectory = await mkdtemp(join(tmpdir(), 'billing-switch-xml-'));
    const prisma = {
      routeXml: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'xml-id', version: 1 }),
      },
    };
    const config = {
      get: jest.fn().mockReturnValue(outputDirectory),
    } as unknown as ConfigService;
    const service = new RouteXmlService(prisma as any, config);
    const routeId = 'b06bde09-53b7-401d-8773-e17ea4752597';
    const xml = '<document type="freeswitch/xml" />';

    await service.materializeOutbound('customer-id', routeId, xml);

    await expect(
      readFile(join(outputDirectory, `outbound_${routeId}.xml`), 'utf8'),
    ).resolves.toBe(xml);
    expect(prisma.routeXml.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { routeId } }),
    );
  });

  it('deletes orphaned inbound XML and flushes the route cache once', async () => {
    outputDirectory = await mkdtemp(join(tmpdir(), 'billing-switch-xml-'));
    await writeFile(join(outputDirectory, 'inbound_8005550000.xml'), 'stale');
    await writeFile(join(outputDirectory, 'inbound_8005551234.xml'), 'active');
    const prisma = {
      routeXml: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ fileName: 'inbound_8005551234.xml' }]),
      },
    };
    const cache = { flush: jest.fn().mockResolvedValue(undefined) };
    const config = {
      get: jest.fn().mockReturnValue(outputDirectory),
    } as unknown as ConfigService;
    const service = new RouteXmlService(prisma as any, config, cache as any);

    await expect(service.cleanupOrphanXmlFiles()).resolves.toEqual({
      deleted: ['inbound_8005550000.xml'],
    });
    await expect(
      readFile(join(outputDirectory, 'inbound_8005550000.xml')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      readFile(join(outputDirectory, 'inbound_8005551234.xml'), 'utf8'),
    ).resolves.toBe('active');
    expect(cache.flush).toHaveBeenCalledTimes(1);
  });
});
