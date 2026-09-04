import { BadRequestException, Injectable } from '@nestjs/common';
import { CallerIdMode, DestinationType, RouteDirection } from '@prisma/client';
import { NormalizationEngineService } from '../normalization/normalization-engine.service';
import { NormalizationProfilesService } from '../normalization/normalization-profiles.service';
import { NormalizationResult } from '../normalization/normalization.types';
import { PrismaService } from '../prisma/prisma.service';
import { ResolvedBridge, ResolvedCallPlan } from '../routing/routing.types';
import { RouteXmlBuilderService } from './route-xml-builder.service';
import { RouteXmlService } from './route-xml.service';

@Injectable()
export class DidXmlGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: NormalizationProfilesService,
    private readonly normalization: NormalizationEngineService,
    private readonly xmlBuilder: RouteXmlBuilderService,
    private readonly xmlStorage: RouteXmlService,
  ) {}

  async generate(customerId: string, customerNumberId: string) {
    const number = await this.prisma.customerNumber.findFirst({
      where: {
        id: customerNumberId,
        customerId,
        status: 'ACTIVE',
        customer: { isActive: true },
        inventory: { status: 'ASSIGNED' },
      },
      include: {
        inventory: true,
        settings: true,
        customer: { include: { settings: true } },
      },
    });
    if (!number) throw new BadRequestException('Assigned DID is not active');

    const did = number.inventory.canonicalNumber;
    const settings = number.settings;
    const defaults = number.customer.settings;
    const destinationType = this.pick(
      settings?.destinationType,
      defaults?.defaultDestinationType,
      DestinationType.CUSTOMER_ENDPOINT,
    )!;
    const egressResults: NormalizationResult[] = [];
    let primary: ResolvedBridge | undefined;
    let failover: ResolvedBridge | undefined;
    let rejectCause: string | undefined;

    if (destinationType === DestinationType.REJECT) {
      rejectCause = 'CALL_REJECTED';
    } else if (destinationType === DestinationType.CUSTOMER_ENDPOINT) {
      const endpoint = await this.customerEndpoint(
        customerId,
        this.pick(settings?.primaryEndpointId, defaults?.defaultEndpointId),
      );
      const profileId = this.pick(
        settings?.egressNormalizationProfileId,
        endpoint.egressNormalizationProfileId,
        defaults?.defaultEgressProfileId,
      );
      const normalized = await this.applyProfile(did, profileId);
      egressResults.push(normalized);
      primary = this.bridge(destinationType, endpoint, normalized.normalized);

      if (settings?.failoverEndpointId) {
        const failoverEndpoint = await this.customerEndpoint(
          customerId,
          settings.failoverEndpointId,
        );
        const failoverResult = await this.applyProfile(
          settings.failoverNumber || did,
          failoverEndpoint.egressNormalizationProfileId || profileId,
        );
        egressResults.push(failoverResult);
        failover = this.bridge(
          DestinationType.CUSTOMER_ENDPOINT,
          failoverEndpoint,
          failoverResult.normalized,
        );
      }
    } else {
      const forwardNumber = this.pick(
        settings?.forwardNumber,
        defaults?.defaultForwardNumber,
        did,
      )!;
      const endpoint = await this.carrierEndpoint(
        forwardNumber,
        this.pick(
          settings?.outboundCarrierEndpointId,
          defaults?.defaultOutboundCarrierEndpointId,
        ),
        defaults?.defaultOutboundCarrierId,
      );
      const customerResult = await this.applyProfile(
        forwardNumber,
        this.pick(
          settings?.egressNormalizationProfileId,
          defaults?.defaultEgressProfileId,
        ),
      );
      const carrierResult = await this.applyProfile(
        customerResult.normalized,
        this.pick(
          endpoint.routeProfileId,
          endpoint.egressNormalizationProfileId,
          endpoint.carrier.defaultEgressProfileId,
        ),
      );
      egressResults.push(customerResult, carrierResult);
      primary = this.bridge(
        DestinationType.CARRIER_ENDPOINT,
        endpoint,
        carrierResult.normalized,
      );
    }

    const plan: ResolvedCallPlan = {
      direction: RouteDirection.INBOUND,
      customerId,
      customerNumberId,
      sourceType: 'CARRIER',
      sourceId: 'persisted-did-configuration',
      rawDestinationNumber: did,
      lookupNumber: did,
      ingressNormalization: this.normalization.apply(did),
      egressNormalizations: egressResults,
      callerIdMode: this.pick(
        settings?.callerIdMode,
        defaults?.defaultCallerIdMode,
        CallerIdMode.PASSTHROUGH,
      )!,
      callerIdNumber: this.pick(
        settings?.callerIdNumber,
        defaults?.defaultCallerIdNumber,
      ),
      callerIdStripPrefix: settings?.callerIdStripPrefix || undefined,
      callerIdAddPrefix: settings?.callerIdAddPrefix || undefined,
      callTimeoutSeconds: this.pick(
        settings?.callTimeoutSeconds,
        defaults?.defaultCallTimeoutSeconds,
        60,
      )!,
      channelLimit: this.pick(
        settings?.channelLimit,
        primary?.destinationType === DestinationType.CUSTOMER_ENDPOINT
          ? await this.endpointChannelLimit(
              primary.host,
              primary.port,
              customerId,
            )
          : undefined,
        defaults?.defaultChannelLimit,
      ),
      recordingEnabled: defaults?.recordingEnabled ?? false,
      primary,
      failover,
      rejectCause,
    };
    const xml = this.xmlBuilder.build(plan);
    return this.xmlStorage.materializeDid(
      customerId,
      customerNumberId,
      did,
      xml,
    );
  }

  async generateAll(customerId: string) {
    const numbers = await this.prisma.customerNumber.findMany({
      where: { customerId, status: 'ACTIVE' },
      select: { id: true },
    });
    const generated: string[] = [];
    const failed: Array<{ customerNumberId: string; error: string }> = [];
    for (const number of numbers) {
      try {
        await this.generate(customerId, number.id);
        generated.push(number.id);
      } catch (error) {
        await this.xmlStorage.invalidateDid(customerId, number.id);
        failed.push({
          customerNumberId: number.id,
          error:
            error instanceof Error ? error.message : 'XML generation failed',
        });
      }
    }
    return { generated: generated.length, failed };
  }

  invalidate(customerId: string, customerNumberId: string) {
    return this.xmlStorage.invalidateDid(customerId, customerNumberId);
  }

  async generateAllCustomers() {
    const customers = await this.prisma.customer.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    const results = [];
    for (const customer of customers) {
      results.push({
        customerId: customer.id,
        ...(await this.generateAll(customer.id)),
      });
    }
    return results;
  }

  private async applyProfile(raw: string, profileId?: string | null) {
    const profile = await this.profiles.findActive(profileId);
    return this.normalization.apply(
      raw,
      profile ? this.normalization.parseSteps(profile.steps) : [],
    );
  }

  private async customerEndpoint(
    customerId: string,
    endpointId?: string | null,
  ) {
    if (!endpointId) {
      throw new BadRequestException(
        'Select a primary endpoint in DID Override or customer defaults before generating XML',
      );
    }
    const endpoint = await this.prisma.customerEndpoint.findFirst({
      where: { id: endpointId, customerId, isActive: true },
    });
    if (!endpoint) throw new BadRequestException('DID endpoint is not active');
    return endpoint;
  }

  private async carrierEndpoint(
    number: string,
    endpointId?: string | null,
    carrierId?: string | null,
  ) {
    if (endpointId) {
      const endpoint = await this.prisma.carrierEndpoint.findFirst({
        where: { id: endpointId, isActive: true, carrier: { isActive: true } },
        include: { carrier: true },
      });
      if (!endpoint)
        throw new BadRequestException('Outbound carrier endpoint is inactive');
      return { ...endpoint, routeProfileId: undefined as string | undefined };
    }
    if (!carrierId) {
      throw new BadRequestException(
        'Select an outbound carrier endpoint for external DID forwarding',
      );
    }
    const routes = await this.prisma.carrierRoute.findMany({
      where: { carrierId, isActive: true, carrierEndpoint: { isActive: true } },
      include: { carrier: true, carrierEndpoint: true },
      orderBy: [{ priority: 'asc' }],
    });
    const route = routes
      .filter((candidate) => number.startsWith(candidate.matchPrefix))
      .sort(
        (a, b) =>
          b.matchPrefix.length - a.matchPrefix.length ||
          a.priority - b.priority,
      )[0];
    if (!route)
      throw new BadRequestException(
        'No carrier prefix route matched the forwarding number',
      );
    return {
      ...route.carrierEndpoint,
      carrier: route.carrier,
      routeProfileId: route.egressNormalizationProfileId || undefined,
    };
  }

  private bridge(
    destinationType: DestinationType,
    endpoint: { host: string; port: number; transport: any },
    number: string,
  ): ResolvedBridge {
    return {
      destinationType,
      host: endpoint.host,
      port: endpoint.port,
      transport: endpoint.transport,
      number,
    };
  }

  private async endpointChannelLimit(
    host: string,
    port: number,
    customerId: string,
  ): Promise<number | undefined> {
    const endpoint = await this.prisma.customerEndpoint.findFirst({
      where: { customerId, host, port },
      select: { channelLimit: true },
    });
    return endpoint?.channelLimit || undefined;
  }

  private pick<T>(...values: Array<T | null | undefined>): T | undefined {
    return values.find(
      (value): value is T => value !== null && value !== undefined,
    );
  }
}
