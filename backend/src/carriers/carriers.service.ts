import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCarrierEndpointDto } from './dto/create-carrier-endpoint.dto';
import { CreateCarrierRouteDto } from './dto/create-carrier-route.dto';
import { CreateCarrierDto } from './dto/create-carrier.dto';
import { UpdateCarrierEndpointDto } from './dto/update-carrier-endpoint.dto';
import { UpdateCarrierDto } from './dto/update-carrier.dto';
import { DidXmlGenerationService } from '../route-xml/did-xml-generation.service';
import { XmlCurlCacheService } from '../xml-curl-integration/xml-curl-cache.service';
import { RoutingService } from '../routing/routing.service';

@Injectable()
export class CarriersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly didXml: DidXmlGenerationService,
    private readonly xmlCurlCache: XmlCurlCacheService,
    private readonly routing: RoutingService,
  ) {}

  async list() {
    const carriers = await this.prisma.carrier.findMany({
      include: { endpoints: true, routes: true },
      orderBy: { name: 'asc' },
    });
    return carriers.map((carrier) => ({
      ...carrier,
      endpoints: carrier.endpoints.map((endpoint) =>
        this.redactEndpoint(endpoint),
      ),
    }));
  }

  async findOne(id: string) {
    const carrier = await this.prisma.carrier.findUnique({
      where: { id },
      include: { endpoints: true, routes: true, sourceAuth: true },
    });
    if (!carrier) throw new NotFoundException('Carrier not found');
    return {
      ...carrier,
      endpoints: carrier.endpoints.map((endpoint) =>
        this.redactEndpoint(endpoint),
      ),
    };
  }

  create(dto: CreateCarrierDto) {
    return this.prisma.carrier.create({ data: dto });
  }

  async update(id: string, dto: UpdateCarrierDto) {
    await this.findOne(id);
    const carrier = await this.prisma.carrier.update({
      where: { id },
      data: dto,
    });
    await this.refreshRuntimeConfiguration();
    return carrier;
  }

  async remove(id: string) {
    await this.findOne(id);
    const carrier = await this.prisma.carrier.delete({ where: { id } });
    await this.refreshRuntimeConfiguration();
    return carrier;
  }

  async createEndpoint(carrierId: string, dto: CreateCarrierEndpointDto) {
    await this.findOne(carrierId);
    return this.prisma.carrierEndpoint.create({ data: { ...dto, carrierId } });
  }

  async updateEndpoint(
    carrierId: string,
    id: string,
    dto: UpdateCarrierEndpointDto,
  ) {
    const endpoint = await this.prisma.carrierEndpoint.findFirst({
      where: { id, carrierId },
    });
    if (!endpoint) throw new NotFoundException('Carrier endpoint not found');
    const updated = await this.prisma.carrierEndpoint.update({
      where: { id },
      data: dto,
    });
    await this.refreshRuntimeConfiguration();
    return updated;
  }

  async removeEndpoint(carrierId: string, id: string) {
    const endpoint = await this.prisma.carrierEndpoint.findFirst({
      where: { id, carrierId },
    });
    if (!endpoint) throw new NotFoundException('Carrier endpoint not found');
    const deleted = await this.prisma.carrierEndpoint.delete({ where: { id } });
    await this.refreshRuntimeConfiguration();
    return deleted;
  }

  async createRoute(carrierId: string, dto: CreateCarrierRouteDto) {
    if (!/^\+?\d*$/.test(dto.matchPrefix)) {
      throw new BadRequestException(
        'matchPrefix must contain only digits or a leading plus',
      );
    }
    const endpoint = await this.prisma.carrierEndpoint.findFirst({
      where: { id: dto.carrierEndpointId, carrierId, isActive: true },
    });
    if (!endpoint)
      throw new BadRequestException(
        'Carrier endpoint is not active or owned by carrier',
      );
    const route = await this.prisma.carrierRoute.create({
      data: { ...dto, carrierId },
    });
    await this.refreshRuntimeConfiguration();
    return route;
  }

  async removeRoute(carrierId: string, id: string) {
    const route = await this.prisma.carrierRoute.findFirst({
      where: { id, carrierId },
    });
    if (!route) throw new NotFoundException('Carrier route not found');
    const deleted = await this.prisma.carrierRoute.delete({ where: { id } });
    await this.refreshRuntimeConfiguration();
    return deleted;
  }

  private async refreshRuntimeConfiguration(): Promise<void> {
    await this.didXml.generateAllCustomers();
    await this.routing.rebuildOutboundRoutes();
    await this.xmlCurlCache.flush();
  }

  private redactEndpoint<T extends { authSecretEncrypted: string | null }>(
    endpoint: T,
  ) {
    const { authSecretEncrypted: _secret, ...safe } = endpoint;
    return safe;
  }
}
