import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerEndpointDto } from './dto/create-customer-endpoint.dto';
import { UpdateCustomerEndpointDto } from './dto/update-customer-endpoint.dto';
import { DidXmlGenerationService } from '../route-xml/did-xml-generation.service';
import { RoutingService } from '../routing/routing.service';
import { KamailioDbService } from '../kamailio/kamailio-db.service';

@Injectable()
export class CustomerEndpointsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly didXml: DidXmlGenerationService,
    private readonly routing: RoutingService,
    private readonly kamailio: KamailioDbService,
  ) {}

  async list(customerId: string) {
    const endpoints = await this.prisma.customerEndpoint.findMany({
      where: { customerId },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
    return endpoints.map((endpoint) => this.redact(endpoint));
  }

  create(customerId: string, dto: CreateCustomerEndpointDto) {
    return this.prisma.customerEndpoint.create({
      data: { ...dto, customerId },
    });
  }

  async update(customerId: string, id: string, dto: UpdateCustomerEndpointDto) {
    await this.assertOwned(customerId, id);
    const endpoint = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.customerEndpoint.update({
        where: { id },
        data: dto,
      });
      const sourceUpdate = {
        ...(dto.host !== undefined ? { ipAddress: dto.host } : {}),
        ...(dto.port !== undefined ? { port: dto.port } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      };
      if (Object.keys(sourceUpdate).length) {
        await transaction.sourceIpAuth.updateMany({
          where: { customerEndpointId: id },
          data: sourceUpdate,
        });
      }
      return result;
    });
    const sources = await this.prisma.sourceIpAuth.findMany({
      where: { customerEndpointId: id },
    });
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { isActive: true },
    });
    await this.kamailio.upsertSources(
      sources.map((source) => ({
        ...source,
        isActive: source.isActive && endpoint.isActive && !!customer?.isActive,
      })),
    );
    const xml = await this.didXml.generateAll(customerId);
    const outboundXml = await this.routing.rebuildOutboundRoutes(customerId);
    return { endpoint, xml, outboundXml };
  }

  async remove(customerId: string, id: string) {
    await this.assertOwned(customerId, id);
    const sources = await this.prisma.sourceIpAuth.findMany({
      where: { customerEndpointId: id },
      select: { id: true },
    });
    const endpoint = await this.prisma.$transaction(async (transaction) => {
      await transaction.sourceIpAuth.deleteMany({
        where: { customerEndpointId: id },
      });
      return transaction.customerEndpoint.delete({ where: { id } });
    });
    await this.kamailio.removeSources(sources.map((source) => source.id));
    const xml = await this.didXml.generateAll(customerId);
    const outboundXml = await this.routing.rebuildOutboundRoutes(customerId);
    return { endpoint, xml, outboundXml };
  }

  private async assertOwned(customerId: string, id: string): Promise<void> {
    const endpoint = await this.prisma.customerEndpoint.findFirst({
      where: { id, customerId },
    });
    if (!endpoint) throw new NotFoundException('Customer endpoint not found');
  }

  private redact<T extends { authSecretHash: string | null }>(endpoint: T) {
    const { authSecretHash: _hash, ...safe } = endpoint;
    return safe;
  }
}
