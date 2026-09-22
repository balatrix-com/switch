import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CallerIdMode,
  DestinationType,
  MatchType,
  RouteDirection,
  SourceType,
} from '@prisma/client';
import { NormalizationEngineService } from '../normalization/normalization-engine.service';
import { NormalizationProfilesService } from '../normalization/normalization-profiles.service';
import { NormalizationResult } from '../normalization/normalization.types';
import { PrismaService } from '../prisma/prisma.service';
import { RouteXmlBuilderService } from '../route-xml/route-xml-builder.service';
import { RouteXmlService } from '../route-xml/route-xml.service';
import { resolveDidRecordingEnabled } from '../route-xml/recording-policy';
import { SourceAuthService } from '../source-auth/source-auth.service';
import { ResolveCallDto } from './dto/resolve-call.dto';
import { ResolveCustomerOutboundDto } from './dto/resolve-customer-outbound.dto';
import { ResolvedBridge, ResolvedCallPlan } from './routing.types';

@Injectable()
export class RoutingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sourceAuth: SourceAuthService,
    private readonly profiles: NormalizationProfilesService,
    private readonly normalization: NormalizationEngineService,
    private readonly xmlBuilder: RouteXmlBuilderService,
    private readonly routeXml: RouteXmlService,
  ) {}

  async resolve(
    dto: ResolveCallDto,
  ): Promise<{ plan: ResolvedCallPlan; xml: string }> {
    const source = await this.sourceAuth.identify(
      dto.sourceIp,
      dto.sourcePort,
      dto.authUsername,
      dto.direction === RouteDirection.INBOUND
        ? SourceType.CARRIER
        : SourceType.CUSTOMER,
    );
    if (!source) throw new ForbiddenException('SIP source is not authorized');

    const plan =
      dto.direction === RouteDirection.INBOUND
        ? await this.resolveInbound(dto, source)
        : await this.resolveOutbound(dto, source);
    const xml = this.xmlBuilder.build(plan);
    if (plan.routeId)
      await this.routeXml.materializeOutbound(
        plan.customerId,
        plan.routeId,
        xml,
      );
    return { plan, xml };
  }

  async resolveCustomerOutbound(
    customerId: string,
    dto: ResolveCustomerOutboundDto,
  ): Promise<{ plan: ResolvedCallPlan; xml: string }> {
    const plan = await this.resolveOutbound(
      {
        direction: RouteDirection.OUTBOUND,
        sourceIp: 'upstream-customer-context',
        destinationNumber: dto.destinationNumber,
        callerIdNumber: dto.callerIdNumber,
      },
      {
        sourceType: SourceType.CUSTOMER,
        customerId,
        customerEndpointId: dto.customerEndpointId,
      },
    );
    const xml = this.xmlBuilder.build(plan);
    if (plan.routeId) {
      await this.routeXml.materializeOutbound(
        plan.customerId,
        plan.routeId,
        xml,
      );
    }
    return { plan, xml };
  }

  async materializeOutboundRoute(customerId: string, routeId: string) {
    const route = await this.prisma.switchRoute.findFirst({
      where: {
        id: routeId,
        customerId,
        direction: RouteDirection.OUTBOUND,
        matchType: MatchType.EXACT,
        isActive: true,
      },
    });
    if (!route) {
      throw new NotFoundException(
        'An active exact outbound route is required to generate SIP XML',
      );
    }
    const plan = await this.resolveOutbound(
      {
        direction: RouteDirection.OUTBOUND,
        sourceIp: 'persisted-outbound-configuration',
        destinationNumber: route.matchValue,
      },
      {
        sourceType: SourceType.CUSTOMER,
        customerId,
      },
      true,
    );
    if (plan.routeId !== routeId) {
      throw new BadRequestException(
        'Outbound route no longer matches its normalized match value',
      );
    }
    return this.routeXml.materializeOutbound(
      customerId,
      routeId,
      this.xmlBuilder.build(plan),
    );
  }

  async rebuildOutboundRoutes(customerId?: string) {
    const routes = await this.prisma.switchRoute.findMany({
      where: {
        ...(customerId ? { customerId } : {}),
        direction: RouteDirection.OUTBOUND,
        matchType: MatchType.EXACT,
      },
      select: { id: true, customerId: true, isActive: true },
    });
    const generated: string[] = [];
    const failed: Array<{ routeId: string; error: string }> = [];
    for (const route of routes) {
      if (!route.isActive) {
        await this.routeXml.invalidateRoute(route.customerId, route.id);
        continue;
      }
      try {
        await this.materializeOutboundRoute(route.customerId, route.id);
        generated.push(route.id);
      } catch (error) {
        await this.routeXml.invalidateRoute(route.customerId, route.id);
        failed.push({
          routeId: route.id,
          error:
            error instanceof Error ? error.message : 'XML generation failed',
        });
      }
    }
    return { generated: generated.length, failed };
  }

  private async resolveInbound(
    dto: ResolveCallDto,
    source: any,
  ): Promise<ResolvedCallPlan> {
    if (source.sourceType !== SourceType.CARRIER || !source.carrierId) {
      throw new ForbiddenException(
        'Inbound calls must originate from a carrier source',
      );
    }
    const carrier = await this.prisma.carrier.findFirst({
      where: { id: source.carrierId, isActive: true },
    });
    if (!carrier) throw new ForbiddenException('Carrier is inactive');
    const sourceEndpoint = source.carrierEndpointId
      ? await this.prisma.carrierEndpoint.findFirst({
          where: { id: source.carrierEndpointId, isActive: true },
        })
      : null;

    const ingressProfileId = this.pick(
      source.ingressNormalizationProfileId,
      sourceEndpoint?.ingressNormalizationProfileId,
      carrier.defaultIngressProfileId,
    );
    const ingress = await this.applySingleProfile(
      dto.destinationNumber,
      ingressProfileId,
    );

    // Carrier normalization deliberately happens before this assigned-number lookup.
    const customerNumber = await this.prisma.customerNumber.findFirst({
      where: {
        status: 'ACTIVE',
        inventory: { canonicalNumber: ingress.normalized },
        customer: { isActive: true },
      },
      include: {
        inventory: true,
        settings: true,
        customer: { include: { settings: true } },
      },
    });
    if (!customerNumber)
      throw new NotFoundException('No customer owns the normalized number');

    const customerId = customerNumber.customerId;
    const defaults = customerNumber.customer.settings;
    const numberSettings = customerNumber.settings;
    const route = await this.matchRoute(
      customerId,
      RouteDirection.INBOUND,
      ingress.normalized,
      customerNumber.id,
    );
    const destinationType = this.pick(
      route?.destinationType,
      numberSettings?.destinationType,
      defaults?.defaultDestinationType,
      DestinationType.CUSTOMER_ENDPOINT,
    )!;
    const callerIdMode = this.pick(
      route?.callerIdMode,
      numberSettings?.callerIdMode,
      defaults?.defaultCallerIdMode,
      CallerIdMode.PASSTHROUGH,
    )!;
    const timeout = numberSettings?.callTimeoutSeconds ?? undefined;
    const egressResults: NormalizationResult[] = [];

    let primary: ResolvedBridge | undefined;
    let failover: ResolvedBridge | undefined;
    let rejectCause: string | undefined;
    if (destinationType === DestinationType.REJECT) {
      rejectCause = 'CALL_REJECTED';
    } else if (destinationType === DestinationType.SIP_USER) {
      const targetUserId = this.pick(
        numberSettings?.targetSipUserId,
        defaults?.defaultTargetSipUserId,
      );
      if (!targetUserId) {
        throw new BadRequestException('Target SIP extension is not configured');
      }
      const sipUser = await this.prisma.sipUser.findFirst({
        where: { id: targetUserId, customerId, isActive: true },
      });
      if (!sipUser) {
        throw new BadRequestException(
          'Configured target SIP extension is not active',
        );
      }
      primary = {
        destinationType: DestinationType.SIP_USER,
        host: 'kamailio',
        port: 5060,
        transport: 'UDP',
        number: sipUser.username,
      };
    } else if (destinationType === DestinationType.CUSTOMER_ENDPOINT) {
      const endpointId = this.pick(
        route?.targetCustomerEndpointId,
        numberSettings?.primaryEndpointId,
        defaults?.defaultEndpointId,
      );
      const endpoint = await this.getCustomerEndpoint(customerId, endpointId);
      const profileId = this.pick(
        route?.egressNormalizationProfileId,
        numberSettings?.egressNormalizationProfileId,
        endpoint.egressNormalizationProfileId,
        defaults?.defaultEgressProfileId,
      );
      const result = await this.applySingleProfile(
        this.pick(route?.destinationNumber, ingress.normalized)!,
        profileId,
      );
      egressResults.push(result);
      primary = this.bridge(destinationType, endpoint, result.normalized);

      const failoverId = this.pick(
        route?.failoverCustomerEndpointId,
        numberSettings?.failoverEndpointId,
      );
      if (failoverId) {
        const failoverEndpoint = await this.getCustomerEndpoint(
          customerId,
          failoverId,
        );
        const failoverResult = await this.applySingleProfile(
          this.pick(
            route?.failoverNumber,
            numberSettings?.failoverNumber,
            result.normalized,
          )!,
          failoverEndpoint.egressNormalizationProfileId ?? profileId,
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
        route?.destinationNumber,
        numberSettings?.forwardNumber,
        defaults?.defaultForwardNumber,
        ingress.normalized,
      )!;
      const carrierSelection = await this.selectCarrier(
        forwardNumber,
        this.pick(route?.targetCarrierId, defaults?.defaultOutboundCarrierId),
        this.pick(
          route?.targetCarrierEndpointId,
          numberSettings?.outboundCarrierEndpointId,
          defaults?.defaultOutboundCarrierEndpointId,
        ),
      );
      const customerEgressProfile = this.pick(
        route?.egressNormalizationProfileId,
        numberSettings?.egressNormalizationProfileId,
        defaults?.defaultEgressProfileId,
      );
      const carrierEgressProfile = this.pick(
        carrierSelection.carrierRoute?.egressNormalizationProfileId,
        carrierSelection.endpoint.egressNormalizationProfileId,
        carrierSelection.carrier.defaultEgressProfileId,
      );
      const chained = await this.applyProfileChain(forwardNumber, [
        customerEgressProfile,
        carrierEgressProfile,
      ]);
      egressResults.push(...chained.results);
      primary = this.bridge(
        DestinationType.CARRIER_ENDPOINT,
        carrierSelection.endpoint,
        chained.value,
      );
    }

    return {
      direction: RouteDirection.INBOUND,
      customerId,
      carrierId: carrier.id,
      carrierEndpointId:
        sourceEndpoint?.id ?? source.carrierEndpointId ?? undefined,
      routeId: route?.id,
      customerNumberId: customerNumber.id,
      sourceType: 'CARRIER',
      sourceId: carrier.id,
      rawDestinationNumber: dto.destinationNumber,
      lookupNumber: ingress.normalized,
      ingressNormalization: ingress,
      egressNormalizations: egressResults,
      callerIdMode,
      callerIdNumber: this.pick(
        route?.callerIdNumber,
        numberSettings?.callerIdNumber,
        defaults?.defaultCallerIdNumber,
      ),
      callerIdStripPrefix: this.pick(
        route?.callerIdStripPrefix,
        numberSettings?.callerIdStripPrefix,
      ),
      callerIdAddPrefix: this.pick(
        route?.callerIdAddPrefix,
        numberSettings?.callerIdAddPrefix,
      ),
      callTimeoutSeconds: timeout,
      channelLimit: this.pick(
        route?.channelLimit,
        numberSettings?.channelLimit,
        primary
          ? await this.endpointChannelLimit(primary, customerId)
          : undefined,
        defaults?.defaultChannelLimit,
      ),
      recordingEnabled: resolveDidRecordingEnabled(
        defaults?.recordingEnabled,
        numberSettings?.recordingEnabled,
      ),
      primary,
      failover,
      rejectCause,
    };
  }

  private async resolveOutbound(
    dto: ResolveCallDto,
    source: any,
    destinationAlreadyNormalized = false,
  ): Promise<ResolvedCallPlan> {
    if (source.sourceType !== SourceType.CUSTOMER || !source.customerId) {
      throw new ForbiddenException(
        'Outbound calls must originate from a customer source',
      );
    }
    const customer = await this.prisma.customer.findFirst({
      where: { id: source.customerId, isActive: true },
      include: { settings: true },
    });
    if (!customer) throw new ForbiddenException('Customer is inactive');
    const sourceEndpoint = source.customerEndpointId
      ? await this.prisma.customerEndpoint.findFirst({
          where: {
            id: source.customerEndpointId,
            customerId: customer.id,
            isActive: true,
          },
        })
      : null;
    const ingressProfileId = this.pick(
      source.ingressNormalizationProfileId,
      sourceEndpoint?.ingressNormalizationProfileId,
      customer.settings?.defaultIngressProfileId,
    );
    const ingress = destinationAlreadyNormalized
      ? this.normalization.apply(dto.destinationNumber, [])
      : await this.applySingleProfile(dto.destinationNumber, ingressProfileId);
    const route = await this.matchRoute(
      customer.id,
      RouteDirection.OUTBOUND,
      ingress.normalized,
    );
    if (!route)
      throw new NotFoundException(
        'No outbound route matched the normalized number',
      );

    const selection = await this.selectCarrier(
      ingress.normalized,
      this.pick(
        route.targetCarrierId,
        customer.settings?.defaultOutboundCarrierId,
      ),
      this.pick(
        route.targetCarrierEndpointId,
        customer.settings?.defaultOutboundCarrierEndpointId,
      ),
    );
    const customerEgressProfile = this.pick(
      route.egressNormalizationProfileId,
      customer.settings?.defaultEgressProfileId,
    );
    const carrierEgressProfile = this.pick(
      selection.carrierRoute?.egressNormalizationProfileId,
      selection.endpoint.egressNormalizationProfileId,
      selection.carrier.defaultEgressProfileId,
    );
    const chained = await this.applyProfileChain(
      this.pick(route.destinationNumber, ingress.normalized)!,
      [customerEgressProfile, carrierEgressProfile],
    );
    const primary = this.bridge(
      DestinationType.CARRIER_ENDPOINT,
      selection.endpoint,
      chained.value,
    );

    return {
      direction: RouteDirection.OUTBOUND,
      customerId: customer.id,
      carrierId: selection.carrier.id,
      carrierEndpointId: selection.endpoint.id,
      routeId: route.id,
      sourceType: 'CUSTOMER',
      sourceId: customer.id,
      rawDestinationNumber: dto.destinationNumber,
      lookupNumber: ingress.normalized,
      ingressNormalization: ingress,
      egressNormalizations: chained.results,
      callerIdMode: this.pick(
        route.callerIdMode,
        customer.settings?.defaultCallerIdMode,
        CallerIdMode.PASSTHROUGH,
      )!,
      callerIdNumber: this.pick(
        route.callerIdNumber,
        customer.settings?.defaultCallerIdNumber,
        dto.callerIdNumber,
      ),
      callerIdStripPrefix: route.callerIdStripPrefix ?? undefined,
      callerIdAddPrefix: route.callerIdAddPrefix ?? undefined,
      channelLimit: this.pick(
        route.channelLimit,
        selection.carrierRoute?.channelLimit,
        selection.endpoint.channelLimit,
        customer.settings?.defaultChannelLimit,
      ),
      recordingEnabled: customer.settings?.recordingEnabled ?? false,
      primary,
    };
  }

  private async matchRoute(
    customerId: string,
    direction: RouteDirection,
    number: string,
    customerNumberId?: string,
  ) {
    if (direction === RouteDirection.INBOUND) return undefined;
    const routes = await this.prisma.switchRoute.findMany({
      where: { customerId, direction, isActive: true },
      orderBy: [{ priority: 'asc' }, { matchValue: 'desc' }],
    });
    return routes
      .filter(
        (route) =>
          !route.customerNumberId ||
          route.customerNumberId === customerNumberId,
      )
      .filter((route) =>
        route.matchType === MatchType.EXACT
          ? route.matchValue === number
          : number.startsWith(route.matchValue),
      )
      .sort((a, b) => {
        if (a.matchType !== b.matchType)
          return a.matchType === MatchType.EXACT ? -1 : 1;
        if (a.matchValue.length !== b.matchValue.length)
          return b.matchValue.length - a.matchValue.length;
        return a.priority - b.priority;
      })[0];
  }

  private async selectCarrier(
    number: string,
    carrierId?: string | null,
    endpointId?: string | null,
  ) {
    if (endpointId) {
      const endpoint = await this.prisma.carrierEndpoint.findFirst({
        where: {
          id: endpointId,
          isActive: true,
          ...(carrierId ? { carrierId } : {}),
        },
        include: { carrier: true },
      });
      if (!endpoint?.carrier.isActive)
        throw new NotFoundException('Selected carrier endpoint is unavailable');
      return { endpoint, carrier: endpoint.carrier, carrierRoute: null };
    }
    if (!carrierId)
      throw new BadRequestException(
        'No outbound carrier or carrier endpoint is configured',
      );
    const routes = await this.prisma.carrierRoute.findMany({
      where: {
        carrierId,
        isActive: true,
        carrier: { isActive: true },
        carrierEndpoint: { isActive: true },
      },
      include: { carrier: true, carrierEndpoint: true },
      orderBy: { priority: 'asc' },
    });
    const carrierRoute = routes
      .filter((candidate) => number.startsWith(candidate.matchPrefix))
      .sort(
        (a, b) =>
          b.matchPrefix.length - a.matchPrefix.length ||
          a.priority - b.priority,
      )[0];
    if (!carrierRoute)
      throw new NotFoundException('No active carrier route matched the number');
    return {
      endpoint: carrierRoute.carrierEndpoint,
      carrier: carrierRoute.carrier,
      carrierRoute,
    };
  }

  private async getCustomerEndpoint(
    customerId: string,
    endpointId?: string | null,
  ) {
    if (!endpointId)
      throw new BadRequestException(
        'No customer destination endpoint is configured',
      );
    const endpoint = await this.prisma.customerEndpoint.findFirst({
      where: { id: endpointId, customerId, isActive: true },
    });
    if (!endpoint)
      throw new NotFoundException(
        'Customer destination endpoint is unavailable',
      );
    return endpoint;
  }

  private bridge(
    type: DestinationType,
    endpoint: {
      host: string;
      port: number;
      transport: any;
    },
    number: string,
  ): ResolvedBridge {
    return {
      destinationType: type,
      host: endpoint.host,
      port: endpoint.port,
      transport: endpoint.transport,
      number,
    };
  }

  private async applySingleProfile(
    value: string,
    profileId?: string | null,
  ): Promise<NormalizationResult> {
    if (!profileId) return this.normalization.apply(value, []);
    const profile = await this.profiles.findActive(profileId);
    if (!profile)
      throw new BadRequestException(
        `Normalization profile ${profileId} is unavailable`,
      );
    return this.normalization.apply(
      value,
      this.normalization.parseSteps(profile.steps),
    );
  }

  private async applyProfileChain(
    value: string,
    profileIds: Array<string | null | undefined>,
  ) {
    const results: NormalizationResult[] = [];
    let current = value;
    for (const id of [
      ...new Set(profileIds.filter((item): item is string => !!item)),
    ]) {
      const result = await this.applySingleProfile(current, id);
      results.push(result);
      current = result.normalized;
    }
    if (!results.length) results.push(this.normalization.apply(value, []));
    return { value: current, results };
  }

  private async endpointChannelLimit(
    bridge: ResolvedBridge,
    customerId: string,
  ): Promise<number | undefined> {
    const endpoint = await this.prisma.customerEndpoint.findFirst({
      where: { customerId, host: bridge.host, port: bridge.port },
      select: { channelLimit: true },
    });
    return endpoint?.channelLimit ?? undefined;
  }

  private pick<T>(...values: Array<T | null | undefined>): T | undefined {
    return values.find(
      (value): value is T => value !== null && value !== undefined,
    );
  }
}
