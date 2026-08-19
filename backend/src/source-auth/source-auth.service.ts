import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SourceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSourceAuthDto } from './dto/create-source-auth.dto';
import { XmlCurlCacheService } from '../xml-curl-integration/xml-curl-cache.service';

@Injectable()
export class SourceAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xmlCurlCache: XmlCurlCacheService,
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
    return entries.map(({ authSecretHash: _hash, ...entry }) => entry);
  }

  async create(dto: CreateSourceAuthDto) {
    this.validateShape(dto);
    const duplicate = await this.prisma.sourceIpAuth.findFirst({
      where: {
        ipAddress: dto.ipAddress,
        port: dto.port ?? 0,
        authUsername: dto.authUsername ?? null,
      },
    });
    if (duplicate) {
      throw new ConflictException(
        'A source identity already exists for this IP, port, and username',
      );
    }
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
    await this.xmlCurlCache.flush();
    return entry;
  }

  async remove(id: string, customerId?: string) {
    const entry = await this.prisma.sourceIpAuth.findFirst({
      where: { id, ...(customerId ? { customerId } : {}) },
    });
    if (!entry) throw new NotFoundException('Source IP/auth entry not found');
    const deleted = await this.prisma.sourceIpAuth.delete({ where: { id } });
    await this.xmlCurlCache.flush();
    return deleted;
  }

  async identify(ipAddress: string, port?: number, authUsername?: string) {
    const candidates = await this.prisma.sourceIpAuth.findMany({
      where: {
        ipAddress,
        isActive: true,
        OR: [{ port: 0 }, ...(port !== undefined ? [{ port }] : [])],
      },
      orderBy: { port: 'desc' },
    });
    return candidates.find((candidate) =>
      candidate.authUsername ? candidate.authUsername === authUsername : true,
    );
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
}
