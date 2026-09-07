import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { XmlCurlCacheService } from '../xml-curl-integration/xml-curl-cache.service';

@Injectable()
export class RouteXmlService {
  private readonly outputDirectory: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    @Optional() private readonly xmlCurlCache?: XmlCurlCacheService,
  ) {
    this.outputDirectory = resolve(
      process.cwd(),
      config.get<string>('XML_OUTPUT_DIR', '../freeswitch-curl-service/xml'),
    );
  }

  list(customerId: string) {
    return this.prisma.routeXml.findMany({
      where: { customerId },
      include: {
        route: true,
        customerNumber: { include: { inventory: true } },
      },
      orderBy: { generatedAt: 'desc' },
    });
  }

  async findOne(customerId: string, routeId: string) {
    const xml = await this.prisma.routeXml.findFirst({
      where: { customerId, routeId },
    });
    if (!xml) throw new NotFoundException('Materialized route XML not found');
    return xml;
  }

  async materialize(customerId: string, routeId: string, xmlContent: string) {
    const configHash = createHash('sha256').update(xmlContent).digest('hex');
    const existing = await this.prisma.routeXml.findUnique({
      where: { routeId },
    });
    if (existing?.configHash === configHash) return existing;
    return this.prisma.routeXml.upsert({
      where: { routeId },
      create: { customerId, routeId, xmlContent, configHash },
      update: {
        xmlContent,
        configHash,
        generatedAt: new Date(),
        version: { increment: 1 },
      },
    });
  }

  async materializeOutbound(
    customerId: string,
    routeId: string,
    xmlContent: string,
  ) {
    const fileName = `outbound_${routeId}.xml`;
    const configHash = createHash('sha256').update(xmlContent).digest('hex');
    const existing = await this.prisma.routeXml.findUnique({
      where: { routeId },
    });

    await mkdir(this.outputDirectory, { recursive: true });
    await writeFile(
      resolve(this.outputDirectory, fileName),
      xmlContent,
      'utf8',
    );

    if (existing?.configHash === configHash && existing.fileName === fileName) {
      await this.xmlCurlCache?.flush();
      return existing;
    }
    const result = await this.prisma.routeXml.upsert({
      where: { routeId },
      create: { customerId, routeId, fileName, xmlContent, configHash },
      update: {
        fileName,
        xmlContent,
        configHash,
        generatedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await this.xmlCurlCache?.flush();
    return result;
  }

  async findDid(customerId: string, customerNumberId: string) {
    const xml = await this.prisma.routeXml.findFirst({
      where: { customerId, customerNumberId },
      include: { customerNumber: { include: { inventory: true } } },
    });
    if (!xml) throw new NotFoundException('Generated DID XML not found');
    return xml;
  }

  async materializeDid(
    customerId: string,
    customerNumberId: string,
    matchNumber: string,
    xmlContent: string,
  ) {
    if (!/^\+?\d{3,39}$/.test(matchNumber)) {
      throw new Error('Cannot generate an XML filename for an invalid DID');
    }
    const fileName = `inbound_${matchNumber}.xml`;
    const configHash = createHash('sha256').update(xmlContent).digest('hex');
    const existing = await this.prisma.routeXml.findUnique({
      where: { customerNumberId },
    });

    await mkdir(this.outputDirectory, { recursive: true });
    await writeFile(
      resolve(this.outputDirectory, fileName),
      xmlContent,
      'utf8',
    );

    if (existing?.configHash === configHash && existing.fileName === fileName) {
      await this.xmlCurlCache?.flush();
      return existing;
    }
    const result = await this.prisma.routeXml.upsert({
      where: { customerNumberId },
      create: {
        customerId,
        customerNumberId,
        matchNumber,
        fileName,
        xmlContent,
        configHash,
      },
      update: {
        matchNumber,
        fileName,
        xmlContent,
        configHash,
        generatedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (existing?.fileName && existing.fileName !== fileName) {
      await this.removeFileAndMaybeFlush(existing.fileName, false);
    }
    await this.xmlCurlCache?.flush();
    return result;
  }

  async invalidateDid(
    customerId: string,
    customerNumberId: string,
  ): Promise<void> {
    const existing = await this.prisma.routeXml.findFirst({
      where: { customerId, customerNumberId },
    });
    if (!existing) {
      await this.xmlCurlCache?.flush();
      return;
    }
    await this.prisma.routeXml.delete({ where: { id: existing.id } });
    await this.removeFile(existing.fileName);
  }

  async invalidateRoute(customerId: string, routeId: string): Promise<void> {
    const existing = await this.prisma.routeXml.findFirst({
      where: { customerId, routeId },
    });
    if (!existing) {
      await this.xmlCurlCache?.flush();
      return;
    }
    await this.prisma.routeXml.delete({ where: { id: existing.id } });
    await this.removeFile(existing.fileName);
  }

  async removeDidFile(customerNumberId: string): Promise<void> {
    const existing = await this.prisma.routeXml.findUnique({
      where: { customerNumberId },
    });
    if (!existing?.fileName) return;
    await this.removeFile(existing.fileName);
  }

  async removeFile(fileName?: string | null): Promise<void> {
    await this.removeFileAndMaybeFlush(fileName, true);
  }

  async cleanupOrphanXmlFiles(): Promise<{ deleted: string[] }> {
    await mkdir(this.outputDirectory, { recursive: true });
    const [files, activeXml] = await Promise.all([
      readdir(this.outputDirectory),
      this.prisma.routeXml.findMany({
        where: {
          customerNumber: {
            is: {
              status: 'ACTIVE',
              inventory: { is: { status: 'ASSIGNED' } },
              customer: { is: { isActive: true } },
            },
          },
        },
        select: { fileName: true },
      }),
    ]);
    const activeFiles = new Set(
      activeXml
        .map(({ fileName }) => fileName)
        .filter((fileName): fileName is string => Boolean(fileName)),
    );
    const deleted = files.filter(
      (fileName) =>
        /^inbound_\+?\d{3,39}\.xml$/.test(fileName) &&
        !activeFiles.has(fileName),
    );
    await Promise.all(
      deleted.map((fileName) => this.removeFileAndMaybeFlush(fileName, false)),
    );
    await this.xmlCurlCache?.flush();
    return { deleted };
  }

  private async removeFileAndMaybeFlush(
    fileName?: string | null,
    flush = true,
  ): Promise<void> {
    if (
      fileName &&
      (/^inbound_\+?\d{3,39}\.xml$/.test(fileName) ||
        /^outbound_[0-9a-f-]{36}\.xml$/i.test(fileName))
    ) {
      await rm(resolve(this.outputDirectory, fileName), { force: true });
    }
    if (flush) await this.xmlCurlCache?.flush();
  }
}
