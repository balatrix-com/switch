import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MatchType, RouteDirection } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSwitchRouteDto } from './dto/create-switch-route.dto';
import { UpdateSwitchRouteDto } from './dto/update-switch-route.dto';
import { RouteXmlService } from '../route-xml/route-xml.service';
import { RoutingService } from '../routing/routing.service';

@Injectable()
export class SwitchRoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routeXml: RouteXmlService,
    private readonly routing: RoutingService,
  ) {}

  listAll(direction?: RouteDirection) {
    return this.prisma.switchRoute.findMany({
      where: direction ? { direction } : undefined,
      include: {
        customer: { select: { id: true, accountCode: true, name: true } },
        customerNumber: { include: { inventory: true } },
        targetCustomerEndpoint: true,
        targetCarrierEndpoint: { include: { carrier: true } },
        xml: { select: { id: true, version: true, generatedAt: true } },
      },
      orderBy: [
        { customer: { name: 'asc' } },
        { direction: 'asc' },
        { priority: 'asc' },
      ],
    });
  }

  list(customerId: string, direction?: RouteDirection) {
    return this.prisma.switchRoute.findMany({
      where: { customerId, ...(direction ? { direction } : {}) },
      include: {
        customerNumber: { include: { inventory: true } },
        targetCustomerEndpoint: true,
        targetCarrierEndpoint: true,
        xml: true,
      },
      orderBy: [
        { direction: 'asc' },
        { priority: 'asc' },
        { matchValue: 'desc' },
      ],
    });
  }

  async findOne(customerId: string, id: string) {
    const route = await this.prisma.switchRoute.findFirst({
      where: { id, customerId },
      include: { xml: true },
    });
    if (!route) throw new NotFoundException('Switch route not found');
    return route;
  }

  async create(customerId: string, dto: CreateSwitchRouteDto) {
    await this.validate(customerId, dto);
    const route = await this.prisma.switchRoute.create({
      data: { ...dto, customerId },
    });
    const xml = route.isActive
      ? await this.routing.materializeOutboundRoute(customerId, route.id)
      : null;
    return { ...route, xml };
  }

  async update(customerId: string, id: string, dto: UpdateSwitchRouteDto) {
    const existing = await this.findOne(customerId, id);
    await this.validate(customerId, { ...existing, ...dto });
    await this.routeXml.invalidateRoute(customerId, id);
    const route = await this.prisma.switchRoute.update({
      where: { id },
      data: dto,
    });
    const xml = route.isActive
      ? await this.routing.materializeOutboundRoute(customerId, route.id)
      : null;
    return { ...route, xml };
  }

  async remove(customerId: string, id: string) {
    await this.findOne(customerId, id);
    await this.routeXml.invalidateRoute(customerId, id);
    return this.prisma.switchRoute.delete({ where: { id } });
  }

  async rebuild(customerId: string, id: string) {
    await this.findOne(customerId, id);
    return this.routing.materializeOutboundRoute(customerId, id);
  }

  private async validate(
    customerId: string,
    dto: {
      direction?: RouteDirection;
      matchValue?: string;
      matchType?: MatchType;
      customerNumberId?: string | null;
      targetCustomerEndpointId?: string | null;
      failoverCustomerEndpointId?: string | null;
      targetCarrierId?: string | null;
      targetCarrierEndpointId?: string | null;
    },
  ): Promise<void> {
    if (dto.direction === RouteDirection.INBOUND) {
      throw new BadRequestException(
        'Inbound routing is configured only from Customer DID settings',
      );
    }
    if (dto.matchType === MatchType.PREFIX) {
      throw new BadRequestException(
        'SIP outbound routes must use EXACT matching because their XML is generated before a call arrives',
      );
    }
    if (!dto.matchValue || !/^\+?\d+$/.test(dto.matchValue)) {
      throw new BadRequestException(
        'matchValue must contain digits with an optional leading plus',
      );
    }
    if (dto.customerNumberId) {
      const number = await this.prisma.customerNumber.findFirst({
        where: { id: dto.customerNumberId, customerId },
      });
      if (!number)
        throw new BadRequestException(
          'Assigned number is not owned by customer',
        );
    }
    for (const endpointId of [
      dto.targetCustomerEndpointId,
      dto.failoverCustomerEndpointId,
    ]) {
      if (!endpointId) continue;
      const endpoint = await this.prisma.customerEndpoint.findFirst({
        where: { id: endpointId, customerId },
      });
      if (!endpoint)
        throw new BadRequestException(
          'A route endpoint is not owned by customer',
        );
    }
    if (dto.targetCarrierEndpointId) {
      const endpoint = await this.prisma.carrierEndpoint.findFirst({
        where: { id: dto.targetCarrierEndpointId, isActive: true },
      });
      if (
        !endpoint ||
        (dto.targetCarrierId && endpoint.carrierId !== dto.targetCarrierId)
      ) {
        throw new BadRequestException('Target carrier endpoint is invalid');
      }
    }
  }
}
