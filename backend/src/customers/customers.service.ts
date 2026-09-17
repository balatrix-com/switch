import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
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
        _count: {
          select: {
            endpoints: true,
            numbers: true,
            routes: true,
            sipUsers: true,
          },
        },
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

  async create(dto: CreateCustomerDto) {
    const {
      adminEmail,
      adminPassword,
      contactName,
      defaultChannelLimit,
      defaultIngressProfileId,
      defaultEgressProfileId,
      defaultCallerIdMode,
      ...customer
    } = dto;
    const email = adminEmail.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
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
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          name: contactName || created.name,
          role: Role.CUSTOMER,
          customerId: created.id,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          customerId: true,
        },
      });
      return { ...created, adminUser: user };
    });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.findOne(id);
    if (dto.extensionLimit !== undefined) {
      const used = await this.prisma.sipUser.count({
        where: { customerId: id },
      });
      if (dto.extensionLimit < used)
        throw new BadRequestException(
          `Extension limit cannot be lower than the ${used} existing extensions`,
        );
    }
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
      const sipUsers = await this.prisma.sipUser.findMany({
        where: { customerId: id },
      });
      for (const user of sipUsers) {
        await this.kamailio.upsertSubscriber({
          username: user.username,
          realm: process.env.SIP_REALM || 'bswitch-dev.balatrix.com',
          ha1: user.secretHash,
          isActive: user.isActive && customer.isActive,
        });
      }
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
    if (dto.defaultTargetSipUserId) {
      const sipUser = await this.prisma.sipUser.findFirst({
        where: { id: dto.defaultTargetSipUserId, customerId, isActive: true },
      });
      if (!sipUser)
        throw new BadRequestException(
          'Default target SIP extension is not active or does not belong to customer',
        );
      if (sipUser.isMonitor)
        throw new BadRequestException(
          'A monitoring extension cannot be assigned as a DID routing destination',
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
