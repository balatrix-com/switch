import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingParty,
  Prisma,
  RateCardType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssignMinimumBillingDto,
  AssignRateCardDto,
  CreateMinimumBillingSettingDto,
  CreateRateCardDto,
  UpdateMinimumBillingSettingDto,
  UpdateRateCardDto,
} from './dto/billing.dto';
import {
  CreateRecordingRateCardDto,
  UpdateRecordingRateCardDto,
  AssignRecordingRateCardDto,
} from './dto/recording-rate-card.dto';

export type CacheRefreshResult = {
  status: 'success' | 'error' | 'skipped';
  message: string;
  details?: unknown;
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  listRateCards(type?: RateCardType) {
    return this.prisma.rateCard.findMany({
      where: type ? { type } : undefined,
      include: {
        _count: {
          select: { customerMappings: true, carrierMappings: true },
        },
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async getRateCard(id: string) {
    const rateCard = await this.prisma.rateCard.findUnique({
      where: { id },
      include: {
        customerMappings: { include: { customer: true } },
        carrierMappings: { include: { carrier: true } },
      },
    });
    if (!rateCard) throw new NotFoundException('Rate card not found');
    return rateCard;
  }

  async createRateCard(dto: CreateRateCardDto) {
    this.validateFlatRates(dto);
    try {
      const data = await this.prisma.rateCard.create({ data: dto });
      return this.withRefresh(data);
    } catch (error) {
      this.rethrowConflict(error, 'A rate card with this name and type already exists');
    }
  }

  async updateRateCard(id: string, dto: UpdateRateCardDto) {
    await this.getRateCard(id);
    this.validateFlatRates(dto);
    try {
      const data = await this.prisma.rateCard.update({
        where: { id },
        data: { ...dto, version: { increment: 1 } },
      });
      return this.withRefresh(data);
    } catch (error) {
      this.rethrowConflict(error, 'A rate card with this name and type already exists');
    }
  }

  async removeRateCard(id: string) {
    await this.getRateCard(id);
    try {
      const data = await this.prisma.rateCard.delete({ where: { id } });
      return this.withRefresh(data);
    } catch (error) {
      if (this.isPrismaError(error, 'P2003')) {
        throw new ConflictException('Remove customer/carrier mappings before deleting this rate card');
      }
      throw error;
    }
  }

  listCustomerMappings() {
    return this.prisma.customerRateCard.findMany({
      include: { customer: true, rateCard: true },
      orderBy: { customer: { name: 'asc' } },
    });
  }

  listCarrierMappings() {
    return this.prisma.carrierRateCard.findMany({
      include: { carrier: true, rateCard: true },
      orderBy: { carrier: { name: 'asc' } },
    });
  }

  async assignCustomerRateCard(customerId: string, dto: AssignRateCardDto) {
    await this.assertEffectiveWindow(dto);
    const [customer, rateCard] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: customerId } }),
      this.prisma.rateCard.findFirst({
        where: { id: dto.rateCardId, type: RateCardType.CUSTOMER, isActive: true },
      }),
    ]);
    if (!customer) throw new NotFoundException('Customer not found');
    if (!rateCard) throw new BadRequestException('Select an active CUSTOMER rate card');
    const values = this.mappingDates(dto);
    const data = await this.prisma.customerRateCard.upsert({
      where: { customerId },
      create: { customerId, rateCardId: dto.rateCardId, ...values },
      update: { rateCardId: dto.rateCardId, ...values },
      include: { customer: true, rateCard: true },
    });
    return this.withRefresh(data);
  }

  async assignCarrierRateCard(carrierId: string, dto: AssignRateCardDto) {
    await this.assertEffectiveWindow(dto);
    const [carrier, rateCard] = await Promise.all([
      this.prisma.carrier.findUnique({ where: { id: carrierId } }),
      this.prisma.rateCard.findFirst({
        where: { id: dto.rateCardId, type: RateCardType.VENDOR, isActive: true },
      }),
    ]);
    if (!carrier) throw new NotFoundException('Carrier not found');
    if (!rateCard) throw new BadRequestException('Select an active VENDOR rate card');
    const values = this.mappingDates(dto);
    const data = await this.prisma.carrierRateCard.upsert({
      where: { carrierId },
      create: { carrierId, rateCardId: dto.rateCardId, ...values },
      update: { rateCardId: dto.rateCardId, ...values },
      include: { carrier: true, rateCard: true },
    });
    return this.withRefresh(data);
  }

  async removeCustomerRateCard(customerId: string) {
    const data = await this.prisma.customerRateCard.delete({ where: { customerId } });
    return this.withRefresh(data);
  }

  async removeCarrierRateCard(carrierId: string) {
    const data = await this.prisma.carrierRateCard.delete({ where: { carrierId } });
    return this.withRefresh(data);
  }

  listMinimumSettings(party?: BillingParty) {
    return this.prisma.minimumBillingSetting.findMany({
      where: party ? { party } : undefined,
      include: {
        _count: { select: { customerMappings: true, carrierMappings: true } },
      },
      orderBy: [{ party: 'asc' }, { name: 'asc' }],
    });
  }

  async createMinimumSetting(dto: CreateMinimumBillingSettingDto) {
    try {
      const data = await this.prisma.minimumBillingSetting.create({ data: dto });
      return this.withRefresh(data);
    } catch (error) {
      this.rethrowConflict(error, 'A minimum billing profile with this name already exists');
    }
  }

  async updateMinimumSetting(id: string, dto: UpdateMinimumBillingSettingDto) {
    const existing = await this.prisma.minimumBillingSetting.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Minimum billing profile not found');
    try {
      const data = await this.prisma.minimumBillingSetting.update({
        where: { id },
        data: dto,
      });
      return this.withRefresh(data);
    } catch (error) {
      this.rethrowConflict(error, 'A minimum billing profile with this name already exists');
    }
  }

  async removeMinimumSetting(id: string) {
    try {
      const data = await this.prisma.minimumBillingSetting.delete({ where: { id } });
      return this.withRefresh(data);
    } catch (error) {
      if (this.isPrismaError(error, 'P2003')) {
        throw new ConflictException('Remove mappings and rate-card defaults before deleting this profile');
      }
      throw error;
    }
  }

  async listMinimumMappings() {
    const [customers, carriers] = await Promise.all([
      this.prisma.customerMinimumBilling.findMany({
        include: { customer: true, setting: true },
        orderBy: { customer: { name: 'asc' } },
      }),
      this.prisma.carrierMinimumBilling.findMany({
        include: { carrier: true, setting: true },
        orderBy: { carrier: { name: 'asc' } },
      }),
    ]);
    return { customers, carriers };
  }

  async assignCustomerMinimum(customerId: string, dto: AssignMinimumBillingDto) {
    const [customer, setting] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: customerId } }),
      this.prisma.minimumBillingSetting.findFirst({
        where: { id: dto.settingId, party: BillingParty.CUSTOMER, isActive: true },
      }),
    ]);
    if (!customer) throw new NotFoundException('Customer not found');
    if (!setting) throw new BadRequestException('Select an active CUSTOMER minimum profile');
    const data = await this.prisma.customerMinimumBilling.upsert({
      where: { customerId },
      create: { customerId, settingId: dto.settingId },
      update: { settingId: dto.settingId },
      include: { customer: true, setting: true },
    });
    return this.withRefresh(data);
  }

  async assignCarrierMinimum(carrierId: string, dto: AssignMinimumBillingDto) {
    const [carrier, setting] = await Promise.all([
      this.prisma.carrier.findUnique({ where: { id: carrierId } }),
      this.prisma.minimumBillingSetting.findFirst({
        where: { id: dto.settingId, party: BillingParty.VENDOR, isActive: true },
      }),
    ]);
    if (!carrier) throw new NotFoundException('Carrier not found');
    if (!setting) throw new BadRequestException('Select an active VENDOR minimum profile');
    const data = await this.prisma.carrierMinimumBilling.upsert({
      where: { carrierId },
      create: { carrierId, settingId: dto.settingId },
      update: { settingId: dto.settingId },
      include: { carrier: true, setting: true },
    });
    return this.withRefresh(data);
  }

  async removeCustomerMinimum(customerId: string) {
    const data = await this.prisma.customerMinimumBilling.delete({ where: { customerId } });
    return this.withRefresh(data);
  }

  async removeCarrierMinimum(carrierId: string) {
    const data = await this.prisma.carrierMinimumBilling.delete({ where: { carrierId } });
    return this.withRefresh(data);
  }

  // --- Recording Rate Cards ---

  listRecordingRateCards() {
    return this.prisma.recordingRateCard.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async getRecordingRateCard(id: number) {
    const rateCard = await this.prisma.recordingRateCard.findUnique({
      where: { id },
    });
    if (!rateCard) throw new NotFoundException('Recording rate card not found');
    return rateCard;
  }

  async createRecordingRateCard(dto: CreateRecordingRateCardDto) {
    try {
      const data = await this.prisma.recordingRateCard.create({ data: dto });
      return this.withRefresh(data);
    } catch (error) {
      this.rethrowConflict(error, 'A recording rate card with this name already exists');
    }
  }

  async updateRecordingRateCard(id: number, dto: UpdateRecordingRateCardDto) {
    await this.getRecordingRateCard(id);
    try {
      const data = await this.prisma.recordingRateCard.update({
        where: { id },
        data: dto,
      });
      return this.withRefresh(data);
    } catch (error) {
      this.rethrowConflict(error, 'A recording rate card with this name already exists');
    }
  }

  async removeRecordingRateCard(id: number) {
    await this.getRecordingRateCard(id);
    try {
      const data = await this.prisma.recordingRateCard.delete({ where: { id } });
      return this.withRefresh(data);
    } catch (error) {
      if (this.isPrismaError(error, 'P2003')) {
        throw new ConflictException('Remove customer mappings before deleting this recording rate card');
      }
      throw error;
    }
  }

  listCustomerRecordingMappings() {
    return this.prisma.customerRecordingRateCard.findMany();
  }

  async assignCustomerRecordingRateCard(customerId: string, dto: AssignRecordingRateCardDto) {
    const [customer, rateCard] = await Promise.all([
      this.prisma.customer.findFirst({
        where: {
          OR: [{ id: customerId }, { accountCode: customerId }],
        },
      }),
      this.prisma.recordingRateCard.findFirst({
        where: { id: dto.recRcId, activeIs: 'Y' },
      }),
    ]);
    if (!customer) throw new NotFoundException('Customer not found');
    if (!rateCard) throw new BadRequestException('Select an active recording rate card');

    const data = await this.prisma.customerRecordingRateCard.upsert({
      where: { custId: customer.id },
      create: { custId: customer.id, recRcId: dto.recRcId },
      update: { recRcId: dto.recRcId },
    });
    return this.withRefresh(data);
  }

  async removeCustomerRecordingRateCard(customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        OR: [{ id: customerId }, { accountCode: customerId }],
      },
    });
    const targetCustId = customer ? customer.id : customerId;
    const data = await this.prisma.customerRecordingRateCard.deleteMany({
      where: {
        OR: [{ custId: targetCustId }, { custId: customerId }],
      },
    });
    return this.withRefresh({ count: data.count });
  }

  refreshCache() {
    return this.performCacheRefresh();
  }

  private async withRefresh<T>(data: T) {
    const cacheRefresh = await this.performCacheRefresh();
    return { data, cacheRefresh };
  }

  private async performCacheRefresh(): Promise<CacheRefreshResult> {
    const url = this.config.get<string>('BILLING_CACHE_REFRESH_URL');
    if (!url) {
      this.logger.warn('Billing cache refresh skipped: BILLING_CACHE_REFRESH_URL is not configured');
      return { status: 'skipped', message: 'BILLING_CACHE_REFRESH_URL is not configured' };
    }
    const token = this.config.get<string>('BILLING_CACHE_REFRESH_TOKEN');
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: token ? { 'X-Auth-Token': token } : undefined,
        signal: AbortSignal.timeout(10000),
      });
      const details: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        this.logger.error(`Billing cache refresh failed: HTTP ${response.status}`);
        return { status: 'error', message: `Billing engine returned HTTP ${response.status}`, details };
      }
      this.logger.log('Billing cache refreshed successfully');
      return { status: 'success', message: 'Billing engine cache refreshed', details };
    } catch (error) {
      this.logger.error(`Billing cache refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Billing engine cache refresh failed',
      };
    }
  }

  private validateFlatRates(dto: CreateRateCardDto | UpdateRateCardDto) {
    if (
      (dto.inboundRatePerMinute !== undefined && Number(dto.inboundRatePerMinute) < 0) ||
      (dto.outboundRatePerMinute !== undefined && Number(dto.outboundRatePerMinute) < 0)
    ) {
      throw new BadRequestException('Inbound and outbound rates cannot be negative');
    }
  }

  private async assertEffectiveWindow(dto: AssignRateCardDto) {
    if (
      dto.effectiveFrom &&
      dto.effectiveTo &&
      new Date(dto.effectiveTo) <= new Date(dto.effectiveFrom)
    ) {
      throw new BadRequestException('effectiveTo must be after effectiveFrom');
    }
  }

  private mappingDates(dto: AssignRateCardDto) {
    return {
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
    };
  }

  private rethrowConflict(error: unknown, message: string): never {
    if (this.isPrismaError(error, 'P2002')) throw new ConflictException(message);
    throw error;
  }

  private isPrismaError(error: unknown, code: string) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
  }
}
