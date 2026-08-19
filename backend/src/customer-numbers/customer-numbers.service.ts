import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateNumberSettingsDto } from './dto/update-number-settings.dto';
import { DidXmlGenerationService } from '../route-xml/did-xml-generation.service';

@Injectable()
export class CustomerNumbersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly didXml: DidXmlGenerationService,
  ) {}

  list(customerId: string) {
    return this.prisma.customerNumber.findMany({
      where: { customerId },
      include: { inventory: true, settings: true, routes: true, xml: true },
      orderBy: { inventory: { canonicalNumber: 'asc' } },
    });
  }

  async findOne(customerId: string, id: string) {
    const number = await this.prisma.customerNumber.findFirst({
      where: { id, customerId },
      include: { inventory: true, settings: true, routes: true, xml: true },
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
    await this.findOne(customerId, customerNumberId);
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
    if (dto.outboundCarrierEndpointId) {
      const endpoint = await this.prisma.carrierEndpoint.findFirst({
        where: { id: dto.outboundCarrierEndpointId, isActive: true },
      });
      if (!endpoint)
        throw new BadRequestException(
          'Outbound carrier endpoint is not active',
        );
    }
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
    return { settings, xml };
  }
}
