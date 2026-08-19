import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NormalizationOwnerType, Prisma } from '@prisma/client';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { XmlCurlCacheService } from '../xml-curl-integration/xml-curl-cache.service';
import { CreateNormalizationProfileDto } from './dto/create-normalization-profile.dto';
import { UpdateNormalizationProfileDto } from './dto/update-normalization-profile.dto';

@Injectable()
export class NormalizationProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly xmlCurlCache: XmlCurlCacheService,
  ) {}

  list(customerId?: string, carrierId?: string) {
    return this.prisma.normalizationProfile.findMany({
      where: {
        OR: [
          { ownerType: NormalizationOwnerType.GLOBAL },
          ...(customerId ? [{ customerId }] : []),
          ...(carrierId ? [{ carrierId }] : []),
        ],
      },
      orderBy: [{ ownerType: 'asc' }, { name: 'asc' }],
    });
  }

  findActive(id?: string | null) {
    if (!id) return null;
    return this.prisma.normalizationProfile.findFirst({
      where: { id, isActive: true },
    });
  }

  create(dto: CreateNormalizationProfileDto) {
    this.validateOwner(dto.ownerType, dto.customerId, dto.carrierId);
    const { steps, ...data } = dto;
    return this.prisma.normalizationProfile.create({
      data: { ...data, steps: steps as unknown as Prisma.InputJsonValue },
    });
  }

  async update(
    id: string,
    ownerCustomerId: string | undefined,
    dto: UpdateNormalizationProfileDto,
  ) {
    const profile = await this.prisma.normalizationProfile.findFirst({
      where: {
        id,
        ...(ownerCustomerId ? { customerId: ownerCustomerId } : {}),
      },
    });
    if (!profile)
      throw new NotFoundException('Normalization profile not found');
    const { steps, ...data } = dto;
    const updated = await this.prisma.normalizationProfile.update({
      where: { id },
      data: {
        ...data,
        ...(steps ? { steps: steps as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    await this.xmlCurlCache.flush();
    const didXml = this.moduleRef.get<{
      generateAll(customerId: string): Promise<unknown>;
      generateAllCustomers(): Promise<unknown>;
    }>('DID_XML_GENERATION_SERVICE', {
      strict: false,
    });
    const routing = this.moduleRef.get<{
      rebuildOutboundRoutes(customerId?: string): Promise<unknown>;
    }>('ROUTING_SERVICE', { strict: false });
    if (
      profile.ownerType === NormalizationOwnerType.CUSTOMER &&
      profile.customerId
    ) {
      await didXml.generateAll(profile.customerId);
      await routing.rebuildOutboundRoutes(profile.customerId);
    } else {
      await didXml.generateAllCustomers();
      await routing.rebuildOutboundRoutes();
    }
    return updated;
  }

  private validateOwner(
    type: NormalizationOwnerType,
    customerId?: string,
    carrierId?: string,
  ): void {
    const valid =
      (type === NormalizationOwnerType.GLOBAL && !customerId && !carrierId) ||
      (type === NormalizationOwnerType.CUSTOMER &&
        !!customerId &&
        !carrierId) ||
      (type === NormalizationOwnerType.CARRIER && !!carrierId && !customerId);
    if (!valid) {
      throw new BadRequestException(
        'Profile owner fields do not match ownerType',
      );
    }
  }
}
