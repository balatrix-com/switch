import { ConfigService } from '@nestjs/config';
import {
  CallerIdMode,
  DestinationType,
  RouteDirection,
  Transport,
} from '@prisma/client';
import { RouteXmlBuilderService } from '../src/route-xml/route-xml-builder.service';
import { ResolvedCallPlan } from '../src/routing/routing.types';

describe('RouteXmlBuilderService', () => {
  const builder = new RouteXmlBuilderService(
    new ConfigService({ KAMAILIO_BRIDGE_HOST: '10.30.0.61:5070' }),
  );

  it('renders primary, failover, caller ID, tenant and channel controls', () => {
    const plan: ResolvedCallPlan = {
      direction: RouteDirection.INBOUND,
      customerId: 'customer-1',
      carrierId: 'carrier-1',
      carrierEndpointId: 'carrier-endpoint-1',
      routeId: 'route-1',
      sourceType: 'CARRIER',
      sourceId: 'carrier-1',
      rawDestinationNumber: '+18005551234',
      lookupNumber: '8005551234',
      ingressNormalization: {
        raw: '+18005551234',
        normalized: '8005551234',
        trace: [],
      },
      egressNormalizations: [],
      callerIdMode: CallerIdMode.OVERRIDE,
      callerIdNumber: '8005550000',
      callTimeoutSeconds: 30,
      channelLimit: 12,
      recordingEnabled: true,
      primary: {
        destinationType: DestinationType.CUSTOMER_ENDPOINT,
        host: '203.0.113.10',
        port: 5060,
        transport: Transport.UDP,
        number: '+18005551234',
      },
      failover: {
        destinationType: DestinationType.CUSTOMER_ENDPOINT,
        host: '203.0.113.11',
        port: 5061,
        transport: Transport.TLS,
        number: '+18005551234',
      },
    };

    const xml = builder.build(plan);
    expect(xml).toContain('billing_session_id=${uuid}');
    expect(xml).toContain('billing_customer_id=customer-1');
    expect(xml).toContain('billing_carrier_id=carrier-1');
    expect(xml).toContain('billing_carrier_endpoint_id=carrier-endpoint-1');
    expect(xml).toContain('billing_direction=inbound');
    expect(xml).toContain('billing_normalized_number=8005551234');
    expect(xml).toContain('customer_customer-1 concurrent 12');
    expect(xml).toContain('RECORD_STEREO=true');
    expect(xml).toContain('recording_follow_transfer=true');
    expect(xml).toContain(
      'execute_on_answer=record_session /var/lib/freeswitch/recordings/customer-1/${uuid}.mp3',
    );
    expect(xml).toContain('effective_caller_id_number=8005550000');
    expect(xml).toContain('sip:+18005551234@203.0.113.10:5060');
    expect(xml).toContain('sip:+18005551234@203.0.113.11:5061');
    expect(xml).toContain('sofia/internal/+18005551234@10.30.0.61:5070');
  });

  it('escapes XML attribute values', () => {
    const xml = builder.build({
      direction: RouteDirection.INBOUND,
      customerId: 'a&b',
      sourceType: 'CARRIER',
      sourceId: 'carrier',
      rawDestinationNumber: '123',
      lookupNumber: '123',
      ingressNormalization: { raw: '123', normalized: '123', trace: [] },
      egressNormalizations: [],
      callerIdMode: CallerIdMode.PASSTHROUGH,
      callTimeoutSeconds: 30,
      rejectCause: 'CALL_REJECTED',
    });
    expect(xml).toContain('billing_customer_id=a&amp;b');
  });
});
