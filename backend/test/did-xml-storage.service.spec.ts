import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
});
