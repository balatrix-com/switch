import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateNumberSettingsDto } from './dto/update-number-settings.dto';
import { DidXmlGenerationService } from '../route-xml/did-xml-generation.service';
import { BulkUpdateNumberSettingsDto } from './dto/bulk-update-number-settings.dto';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class CustomerNumbersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly didXml: DidXmlGenerationService,
    private readonly billing: BillingService,
  ) {}

  list(customerId: string) {
    return this.prisma.customerNumber.findMany({
      where: { customerId },
      include: {
        inventory: true,
        settings: { include: { targetSipUser: true } },
        routes: true,
        xml: true,
      },
      orderBy: { inventory: { canonicalNumber: 'asc' } },
    });
  }

  async findOne(customerId: string, id: string) {
    const number = await this.prisma.customerNumber.findFirst({
      where: { id, customerId },
      include: {
        inventory: true,
        settings: { include: { targetSipUser: true } },
        routes: true,
        xml: true,
      },
    });
    if (!number)
      throw new NotFoundException('Assigned customer number not found');
    return number;
  }

  async updateSettings(
    customerId: string,
    customerNumberId: string,
    dto: UpdateNumberSettingsDto,
  ) {
    const number = await this.findOne(customerId, customerNumberId);
    await this.validateSettings(customerId, dto);
    const rateCardChanged = dto.providerRateCardId !== undefined && dto.providerRateCardId !== (number.settings?.providerRateCardId ?? null);
    const settings = await this.prisma.numberSettings.upsert({
      where: { customerNumberId },
      create: { customerId, customerNumberId, ...dto },
      update: dto,
    });
    let xml;
    try {
      xml = await this.didXml.generate(customerId, customerNumberId);
    } catch (error) {
      await this.didXml.invalidate(customerId, customerNumberId);
      throw error;
    }
    const cacheRefresh = rateCardChanged ? await this.billing.refreshCache() : null;
    return { settings, xml, cacheRefresh };
  }

  async bulkUpdateSettings(
    customerId: string,
    dto: BulkUpdateNumberSettingsDto,
  ) {
    const customerNumberIds = [...new Set(dto.customerNumberIds)];
    const owned = await this.prisma.customerNumber.findMany({
      where: { customerId, id: { in: customerNumberIds } },
      select: { id: true },
    });
    if (owned.length !== customerNumberIds.length) {
      const found = new Set(owned.map(({ id }) => id));
      const invalid = customerNumberIds.filter((id) => !found.has(id));
      throw new BadRequestException(
        `Customer numbers do not exist or are not owned by customer: ${invalid.join(', ')}`,
      );
    }
    await this.validateSettings(customerId, dto.settings);
    await this.prisma.$transaction(
      customerNumberIds.map((customerNumberId) =>
        this.prisma.numberSettings.upsert({
          where: { customerNumberId },
          create: { customerId, customerNumberId, ...dto.settings },
          update: dto.settings,
        }),
      ),
    );
    const generation = await this.didXml.generateBulk(
      customerId,
      customerNumberIds,
      { dbOnly: true },
    );
    const cacheRefresh = dto.settings.providerRateCardId !== undefined ? await this.billing.refreshCache() : null;
    return { updated: customerNumberIds.length, failed: generation.failed, cacheRefresh };
  }

  private async validateSettings(
    customerId: string,
    dto: UpdateNumberSettingsDto,
  ) {
    if (dto.providerRateCardId) {
      const card = await this.prisma.rateCard.findFirst({ where: { id: dto.providerRateCardId, type: 'CUSTOMER', isActive: true }, select: { id: true } });
      if (!card) throw new BadRequestException('Selected DID provider rate card must be an active customer rate card');
    }
    for (const endpointId of [dto.primaryEndpointId, dto.failoverEndpointId]) {
      if (!endpointId) continue;
      const endpoint = await this.prisma.customerEndpoint.findFirst({
        where: { id: endpointId, customerId },
      });
      if (!endpoint)
        throw new BadRequestException(
          'A selected endpoint is not owned by customer',
        );
    }
    if (dto.targetSipUserId) {
      const sipUser = await this.prisma.sipUser.findFirst({
        where: { id: dto.targetSipUserId, customerId, isActive: true },
      });
      if (!sipUser)
        throw new BadRequestException(
          'Target SIP extension is not active or does not belong to customer',
        );
      if (sipUser.isMonitor)
        throw new BadRequestException(
          'A monitoring extension cannot be assigned as a DID routing destination',
        );
    }
    if (dto.outboundCarrierEndpointId) {
      const endpoint = await this.prisma.carrierEndpoint.findFirst({
        where: { id: dto.outboundCarrierEndpointId, isActive: true },
      });
      if (!endpoint)
        throw new BadRequestException(
          'Outbound carrier endpoint is not active',
        );
    }
    for (const profileId of [
      dto.ingressNormalizationProfileId,
      dto.egressNormalizationProfileId,
    ]) {
      if (!profileId) continue;
      const profile = await this.prisma.normalizationProfile.findFirst({
        where: {
          id: profileId,
          isActive: true,
          OR: [{ customerId }, { ownerType: 'GLOBAL' }],
        },
        select: { id: true },
      });
      if (!profile)
        throw new BadRequestException(
          'A selected normalization profile is not active or available to customer',
        );
    }
  }
}
