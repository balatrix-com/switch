import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SourceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSourceAuthDto } from './dto/create-source-auth.dto';
import { XmlCurlCacheService } from '../xml-curl-integration/xml-curl-cache.service';
import { KamailioDbService } from '../kamailio/kamailio-db.service';
import { UpdateSourceAuthDto } from './dto/update-source-auth.dto';

@Injectable()
export class SourceAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xmlCurlCache: XmlCurlCacheService,
    private readonly kamailio: KamailioDbService,
  ) {}

  async list(customerId?: string) {
    const entries = await this.prisma.sourceIpAuth.findMany({
      where: customerId ? { customerId } : undefined,
      include: {
        customer: { select: { id: true, accountCode: true, name: true } },
        carrier: { select: { id: true, code: true, name: true } },
        customerEndpoint: {
          select: {
            id: true,
            name: true,
            direction: true,
            host: true,
            port: true,
          },
        },
        carrierEndpoint: {
          select: {
            id: true,
            name: true,
            direction: true,
            host: true,
            port: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return entries.map(({ authSecretHash: _hash, ...entry }) => ({
      ...entry,
      kamailioGroup: this.kamailio.groupFor(entry.sourceType),
    }));
  }

  async create(dto: CreateSourceAuthDto) {
    this.validateShape(dto);
    if (dto.sourceType === SourceType.CUSTOMER) {
      const endpoint = dto.customerEndpointId
        ? await this.prisma.customerEndpoint.findFirst({
            where: { id: dto.customerEndpointId, customerId: dto.customerId },
          })
        : null;
      if (dto.customerEndpointId && !endpoint) {
        throw new BadRequestException(
          'Customer endpoint is not owned by customer',
        );
      }
    } else if (dto.carrierEndpointId) {
      const endpoint = await this.prisma.carrierEndpoint.findFirst({
        where: { id: dto.carrierEndpointId, carrierId: dto.carrierId },
      });
      if (!endpoint)
        throw new BadRequestException(
          'Carrier endpoint is not owned by carrier',
        );
    }
    const entry = await this.prisma.sourceIpAuth.create({ data: dto });
    await this.kamailio.upsertSource(await this.effectiveKamailioSource(entry.id));
    await this.xmlCurlCache.flush();
    return entry;
  }

  async update(id: string, dto: UpdateSourceAuthDto, customerId?: string) {
    const entry = await this.prisma.sourceIpAuth.findFirst({
      where: { id, ...(customerId ? { customerId } : {}) },
    });
    if (!entry) throw new NotFoundException('Source IP/auth entry not found');
    const updated = await this.prisma.sourceIpAuth.update({
      where: { id },
      data: dto,
    });
    await this.kamailio.upsertSource(await this.effectiveKamailioSource(updated.id));
    await this.xmlCurlCache.flush();
    return updated;
  }

  async remove(id: string, customerId?: string) {
    const entry = await this.prisma.sourceIpAuth.findFirst({
      where: { id, ...(customerId ? { customerId } : {}) },
    });
    if (!entry) throw new NotFoundException('Source IP/auth entry not found');
    const deleted = await this.prisma.sourceIpAuth.delete({ where: { id } });
    await this.kamailio.removeSource(id);
    await this.xmlCurlCache.flush();
    return deleted;
  }

  async syncKamailio() {
    const sources = await this.prisma.sourceIpAuth.findMany({
      include: {
        customer: { select: { isActive: true } },
        carrier: { select: { isActive: true } },
        customerEndpoint: { select: { isActive: true } },
        carrierEndpoint: { select: { isActive: true } },
      },
    });
    const effective = sources.map((source) => ({
      ...source,
      isActive:
        source.isActive &&
        (source.customer?.isActive ?? source.carrier?.isActive ?? false) &&
        (source.customerEndpoint?.isActive ??
          source.carrierEndpoint?.isActive ??
          true),
    }));
    const active = await this.kamailio.replaceManagedSources(effective);
    return { synchronized: active, total: sources.length };
  }

  async identify(
    ipAddress: string,
    port?: number,
    authUsername?: string,
    sourceType?: SourceType,
  ) {
    const candidates = await this.prisma.sourceIpAuth.findMany({
      where: {
        ipAddress,
        ...(sourceType ? { sourceType } : {}),
        isActive: true,
        OR: [{ port: 0 }, ...(port !== undefined ? [{ port }] : [])],
      },
      orderBy: { port: 'desc' },
    });
    const matches = candidates.filter((candidate) =>
      candidate.authUsername ? candidate.authUsername === authUsername : true,
    );
    const owners = new Set(
      matches.map((candidate) =>
        candidate.sourceType === SourceType.CARRIER
          ? `CARRIER:${candidate.carrierId}`
          : `CUSTOMER:${candidate.customerId}`,
      ),
    );
    if (owners.size > 1) {
      throw new BadRequestException(
        'This IP, port, and username matches multiple owners; use a distinct port or SIP username',
      );
    }
    return matches[0];
  }

  private validateShape(dto: CreateSourceAuthDto): void {
    const isCustomer =
      dto.sourceType === SourceType.CUSTOMER &&
      !!dto.customerId &&
      !dto.carrierId &&
      !dto.carrierEndpointId;
    const isCarrier =
      dto.sourceType === SourceType.CARRIER &&
      !!dto.carrierId &&
      !dto.customerId &&
      !dto.customerEndpointId;
    if (!isCustomer && !isCarrier) {
      throw new BadRequestException(
        'Source owner fields do not match sourceType',
      );
    }
  }

  private async effectiveKamailioSource(id: string) {
    const source = await this.prisma.sourceIpAuth.findUniqueOrThrow({
      where: { id },
      include: {
        customer: { select: { isActive: true } },
        carrier: { select: { isActive: true } },
        customerEndpoint: { select: { isActive: true } },
        carrierEndpoint: { select: { isActive: true } },
      },
    });
    return {
      ...source,
      isActive:
        source.isActive &&
        (source.customer?.isActive ?? source.carrier?.isActive ?? false) &&
        (source.customerEndpoint?.isActive ??
          source.carrierEndpoint?.isActive ??
          true),
    };
  }
}
