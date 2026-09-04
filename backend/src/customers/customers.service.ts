import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerSettingsDto } from './dto/update-customer-settings.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { DidXmlGenerationService } from '../route-xml/did-xml-generation.service';
import { RoutingService } from '../routing/routing.service';
import { KamailioDbService } from '../kamailio/kamailio-db.service';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly didXml: DidXmlGenerationService,
    private readonly routing: RoutingService,
    private readonly kamailio: KamailioDbService,
  ) {}

  list() {
    return this.prisma.customer.findMany({
      include: {
        settings: true,
        _count: { select: { endpoints: true, numbers: true, routes: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { settings: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  create(dto: CreateCustomerDto) {
    const {
      defaultChannelLimit,
      defaultIngressProfileId,
      defaultEgressProfileId,
      defaultCallerIdMode,
      ...customer
    } = dto;
    return this.prisma.customer.create({
      data: {
        ...customer,
        settings: {
          create: {
            defaultChannelLimit,
            defaultIngressProfileId,
            defaultEgressProfileId,
            defaultCallerIdMode,
          },
        },
      },
      include: { settings: true },
    });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.findOne(id);
    const customer = await this.prisma.customer.update({
      where: { id },
      data: dto,
    });
    if (dto.isActive !== undefined) {
      const sources = await this.prisma.sourceIpAuth.findMany({
        where: { customerId: id },
        include: { customerEndpoint: { select: { isActive: true } } },
      });
      await this.kamailio.upsertSources(
        sources.map((source) => ({
          ...source,
          isActive:
            source.isActive &&
            customer.isActive &&
            (source.customerEndpoint?.isActive ?? true),
        })),
      );
      await this.didXml.generateAll(id);
      await this.routing.rebuildOutboundRoutes(id);
    }
    return customer;
  }

  async updateSettings(customerId: string, dto: UpdateCustomerSettingsDto) {
    await this.findOne(customerId);
    if (dto.defaultEndpointId) {
      const endpoint = await this.prisma.customerEndpoint.findFirst({
        where: { id: dto.defaultEndpointId, customerId },
      });
      if (!endpoint)
        throw new BadRequestException(
          'Default endpoint is not owned by customer',
        );
    }
    if (dto.defaultOutboundCarrierEndpointId) {
      const endpoint = await this.prisma.carrierEndpoint.findFirst({
        where: { id: dto.defaultOutboundCarrierEndpointId, isActive: true },
      });
      if (!endpoint)
        throw new BadRequestException('Default carrier endpoint is not active');
      if (
        dto.defaultOutboundCarrierId &&
        endpoint.carrierId !== dto.defaultOutboundCarrierId
      ) {
        throw new BadRequestException(
          'Default carrier endpoint does not belong to selected carrier',
        );
      }
    }
    const settings = await this.prisma.customerSettings.upsert({
      where: { customerId },
      create: { customerId, ...dto },
      update: dto,
    });
    const xml = await this.didXml.generateAll(customerId);
    const outboundXml = await this.routing.rebuildOutboundRoutes(customerId);
    return { settings, xml, outboundXml };
  }
}
