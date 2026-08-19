import { ConfigService } from '@nestjs/config';
import {
  CallerIdMode,
  DestinationType,
  RouteDirection,
  SourceType,
  Transport,
} from '@prisma/client';
import { NormalizationEngineService } from '../src/normalization/normalization-engine.service';
import { NormalizationOperation } from '../src/normalization/normalization.types';
import { RouteXmlBuilderService } from '../src/route-xml/route-xml-builder.service';
import { RoutingService } from '../src/routing/routing.service';

describe('RoutingService inbound ordering', () => {
  it('normalizes the carrier number before querying customer assignments', async () => {
    const prisma: any = {
      carrier: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'carrier-1',
          isActive: true,
          defaultIngressProfileId: 'ingress',
          defaultCallTimeoutSeconds: 60,
        }),
      },
      carrierEndpoint: { findFirst: jest.fn() },
      customerNumber: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'number-1',
          customerId: 'customer-1',
          inventory: { canonicalNumber: '8005551234' },
          settings: null,
          customer: {
            settings: {
              defaultEndpointId: 'endpoint-1',
              defaultCallerIdMode: CallerIdMode.PASSTHROUGH,
              defaultCallTimeoutSeconds: 60,
            },
          },
        }),
      },
      switchRoute: { findMany: jest.fn().mockResolvedValue([]) },
      customerEndpoint: {
        findFirst: jest.fn().mockResolvedValue({
          host: '203.0.113.10',
          port: 5060,
          transport: Transport.UDP,
          egressNormalizationProfileId: null,
          channelLimit: 10,
        }),
      },
      routeXml: {},
    };
    const sourceAuth: any = {
      identify: jest.fn().mockResolvedValue({
        sourceType: SourceType.CARRIER,
        carrierId: 'carrier-1',
        ingressNormalizationProfileId: 'ingress',
      }),
    };
    const profiles: any = {
      findActive: jest.fn().mockResolvedValue({
        steps: [
          { operation: NormalizationOperation.TRIM },
          { operation: NormalizationOperation.STRIP_PREFIX, value: '+1' },
        ],
      }),
    };
    const materialized: any = { materialize: jest.fn() };
    const service = new RoutingService(
      prisma,
      sourceAuth,
      profiles,
      new NormalizationEngineService(),
      new RouteXmlBuilderService(
        new ConfigService({ KAMAILIO_BRIDGE_HOST: '10.30.0.61:5070' }),
      ),
      materialized,
    );

    const result = await service.resolve({
      direction: RouteDirection.INBOUND,
      sourceIp: '198.51.100.5',
      destinationNumber: ' +18005551234 ',
    });

    expect(prisma.customerNumber.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          inventory: { canonicalNumber: '8005551234' },
        }),
      }),
    );
    expect(result.plan.lookupNumber).toBe('8005551234');
    expect(result.plan.customerId).toBe('customer-1');
    expect(result.plan.primary?.destinationType).toBe(
      DestinationType.CUSTOMER_ENDPOINT,
    );
  });
});
