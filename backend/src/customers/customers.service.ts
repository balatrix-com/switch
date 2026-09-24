import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NumberInventoryStatus, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerSettingsDto } from './dto/update-customer-settings.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { DidXmlGenerationService } from '../route-xml/did-xml-generation.service';
import { RouteXmlService } from '../route-xml/route-xml.service';
import { RoutingService } from '../routing/routing.service';
import { KamailioDbService } from '../kamailio/kamailio-db.service';
import { SubscriptionClientService } from '../subscription/subscription-client.service';
import { ZeptoMailService } from '../email/zeptomail.service';
import { SendCredentialsDto } from './dto/send-credentials.dto';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly didXml: DidXmlGenerationService,
    private readonly routing: RoutingService,
    private readonly kamailio: KamailioDbService,
    private readonly subscriptionClient: SubscriptionClientService,
    private readonly routeXml: RouteXmlService,
    private readonly zeptoMail: ZeptoMailService,
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

    const created = await this.prisma.$transaction(async (tx) => {
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

    const walletCurrency = created.currency || 'USD';
    const walletCredit = Number(created.creditBalance) || 0;

    try {
      await this.prisma.customerWallet.create({
        data: {
          customerId: created.id,
          fiatBalance: walletCredit,
          creditLimit: walletCredit,
          currency: walletCurrency,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to initialize wallet for customer ${created.id}: ${(error as Error).message}`,
      );
    }

    try {
      await this.zeptoMail.sendUserCredentials({
        email,
        password: adminPassword,
        name: contactName || created.name,
        role: 'CUSTOMER',
        customerId: created.id,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to send credential email for customer ${created.id}: ${(error as Error).message}`,
      );
    }

    return created;
  }

  async sendCredentials(id: string, dto: SendCredentialsDto) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const adminUser = await this.prisma.user.findFirst({
      where: {
        customerId: id,
        role: Role.CUSTOMER,
        status: UserStatus.ACTIVE,
      },
      select: {
        email: true,
        name: true,
        passwordHash: true,
      },
    });
    if (!adminUser)
      throw new NotFoundException(
        'Active customer administrator account not found',
      );

    if (!(await bcrypt.compare(dto.password, adminUser.passwordHash)))
      throw new BadRequestException(
        "The supplied password does not match the customer's current login password",
      );

    const credentialEmail = await this.zeptoMail.sendUserCredentials({
      email: adminUser.email,
      password: dto.password,
      name: adminUser.name || customer.name,
      role: 'CUSTOMER',
      customerId: customer.id,
    });

    return {
      status: credentialEmail.status,
      email: adminUser.email,
      credentialEmail,
    };
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

  async remove(id: string) {
    const customer = await this.findOne(id);

    const [sources, xmlRecords, assignedNumbers] = await Promise.all([
      this.prisma.sourceIpAuth.findMany({
        where: { customerId: id },
        select: { id: true },
      }),
      this.prisma.routeXml.findMany({
        where: { customerId: id },
        select: { fileName: true },
      }),
      this.prisma.customerNumber.findMany({
        where: { customerId: id },
        select: { inventoryId: true },
      }),
    ]);

    await this.prisma.$transaction(async (tx) => {
      if (assignedNumbers.length > 0) {
        await tx.globalNumberInventory.updateMany({
          where: {
            id: { in: assignedNumbers.map((n) => n.inventoryId) },
          },
          data: {
            status: NumberInventoryStatus.AVAILABLE,
          },
        });
      }

      await tx.customer.delete({
        where: { id },
      });
    });

    if (sources.length > 0) {
      try {
        await this.kamailio.removeSources(sources.map((s) => s.id));
      } catch (error) {
        this.logger.warn(
          `Failed to remove Kamailio sources for customer ${id}: ${(error as Error).message}`,
        );
      }
    }

    for (const { fileName } of xmlRecords) {
      if (fileName) {
        try {
          await this.routeXml.removeFile(fileName);
        } catch (error) {
          this.logger.warn(
            `Failed to remove XML file ${fileName}: ${(error as Error).message}`,
          );
        }
      }
    }

    return {
      success: true,
      message: 'Customer deleted successfully',
      id: customer.id,
      accountCode: customer.accountCode,
      name: customer.name,
    };
  }
}
