import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CallerIdMode, DestinationType } from '@prisma/client';
import { ResolvedBridge, ResolvedCallPlan } from '../routing/routing.types';

@Injectable()
export class RouteXmlBuilderService {
  private readonly kamailioHost: string;
  private readonly recordingsDirectory: string;

  constructor(config: ConfigService) {
    this.kamailioHost = config.get<string>(
      'KAMAILIO_BRIDGE_HOST',
      '127.0.0.1:5070',
    );
    this.recordingsDirectory = config
      .get<string>(
        'FREESWITCH_RECORDINGS_DIR',
        '/var/lib/freeswitch/recordings',
      )
      .replace(/[\\/]+$/, '');
  }

  build(plan: ResolvedCallPlan): string {
    const extensionName = this.escape(
      `route_${plan.routeId ?? plan.customerNumberId ?? 'resolved'}`,
    );
    const actions: string[] = [
      this.action('set', 'continue_on_fail=true'),
      this.action('set', 'hangup_after_bridge=true'),
      this.action('set', `call_timeout=${plan.callTimeoutSeconds}`),
      this.action('set', 'ignore_early_media=true'),
      this.action('set', `accountcode=${plan.customerId}`),
      this.action('export', `accountcode=${plan.customerId}`),
      this.action('export', 'billing_session_id=${uuid}'),
      this.action('export', `billing_customer_id=${plan.customerId}`),
      this.action(
        'export',
        `billing_direction=${plan.direction.toLowerCase()}`,
      ),
      this.action('export', `billing_source_type=${plan.sourceType}`),
      this.action('export', `billing_source_id=${plan.sourceId}`),
      this.action(
        'export',
        `billing_original_number=${plan.rawDestinationNumber}`,
      ),
      this.action('export', `billing_normalized_number=${plan.lookupNumber}`),
    ];

    if (plan.routeId)
      actions.push(this.action('export', `billing_route_id=${plan.routeId}`));
    if (plan.customerNumberId)
      actions.push(
        this.action(
          'export',
          `billing_customer_number_id=${plan.customerNumberId}`,
        ),
      );
    if (plan.carrierId)
      actions.push(
        this.action('export', `billing_carrier_id=${plan.carrierId}`),
      );
    if (plan.carrierEndpointId)
      actions.push(
        this.action(
          'export',
          `billing_carrier_endpoint_id=${plan.carrierEndpointId}`,
        ),
      );

    if (plan.channelLimit) {
      actions.push(
        this.action(
          'limit',
          `hash customer_${plan.customerId} concurrent ${plan.channelLimit} !USER_BUSY`,
        ),
      );
    }
    if (plan.recordingEnabled) {
      actions.push(
        this.action('set', 'RECORD_STEREO=true'),
        this.action('set', 'recording_follow_transfer=true'),
        this.action(
          'set',
          `execute_on_answer=record_session ${this.recordingsDirectory}/${plan.customerId}/\${uuid}.mp3`,
        ),
      );
    }
    actions.push(...this.callerIdActions(plan));

    if (plan.rejectCause || !plan.primary) {
      actions.push(
        this.action('hangup', plan.rejectCause ?? 'UNALLOCATED_NUMBER'),
      );
    } else {
      actions.push(...this.bridgeActions(plan.primary, 'Primary destination'));
      if (plan.failover)
        actions.push(
          ...this.bridgeActions(plan.failover, 'Failover destination'),
        );
      actions.push(this.action('hangup', 'NORMAL_TEMPORARY_FAILURE'));
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<document type="freeswitch/xml">
  <section name="dialplan">
    <context name="public">
      <extension name="${extensionName}">
        <condition field="destination_number" expression=".*">
${actions.map((line) => `          ${line}`).join('\n')}
        </condition>
      </extension>
    </context>
  </section>
</document>`;
  }

  notFound(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<document type="freeswitch/xml">
  <section name="result"><result status="not found"/></section>
</document>`;
  }

  private bridgeActions(bridge: ResolvedBridge, comment: string): string[] {
    if (bridge.destinationType === DestinationType.SIP_USER) {
      return [
        `<!-- ${comment}: SIP Extension ${bridge.number} -->`,
        this.action('export', 'sip_h_X-Dest-Type=SIP_USER'),
        this.action(
          'export',
          `sip_invite_to_uri=sip:${bridge.number}@${this.kamailioHost}`,
        ),
        this.action(
          'bridge',
          `sofia/internal/${bridge.number}@${this.kamailioHost}`,
        ),
      ];
    }

    const host = `${bridge.host}:${bridge.port}`;
    return [
      `<!-- ${comment} -->`,
      this.action('export', `sip_h_X-Dest-Host=${host}`),
      this.action('export', `sip_h_X-Carrier-Host=${host}`),
      this.action(
        'export',
        `sip_h_X-Dest-Transport=${bridge.transport.toLowerCase()}`,
      ),
      this.action(
        'export',
        `sip_h_X-Carrier-Transport=${bridge.transport.toLowerCase()}`,
      ),
      this.action('export', `sip_invite_to_uri=sip:${bridge.number}@${host}`),
      this.action(
        'bridge',
        `sofia/internal/${bridge.number}@${this.kamailioHost}`,
      ),
    ];
  }

  private callerIdActions(plan: ResolvedCallPlan): string[] {
    switch (plan.callerIdMode) {
      case CallerIdMode.OVERRIDE:
        return plan.callerIdNumber
          ? [
              this.action(
                'set',
                `effective_caller_id_number=${plan.callerIdNumber}`,
              ),
              this.action(
                'set',
                `effective_caller_id_name=${plan.callerIdNumber}`,
              ),
            ]
          : [];
      case CallerIdMode.CALLED_NUMBER:
        return [
          this.action(
            'set',
            'effective_caller_id_number=${destination_number}',
          ),
          this.action('set', 'effective_caller_id_name=${destination_number}'),
        ];
      case CallerIdMode.ANONYMOUS:
        return [
          this.action('set', 'effective_caller_id_number=anonymous'),
          this.action('set', 'effective_caller_id_name=anonymous'),
          this.action('set', 'sip_h_Privacy=id'),
        ];
      case CallerIdMode.STRIP_ADD: {
        const strip = this.regexEscape(plan.callerIdStripPrefix ?? '');
        const add = plan.callerIdAddPrefix ?? '';
        const expression = strip
          ? `${add}\${regex(\${caller_id_number}|^${strip}(.*)$|\\1)}`
          : `${add}\${caller_id_number}`;
        return [
          this.action('set', `effective_caller_id_number=${expression}`),
          this.action('set', `effective_caller_id_name=${expression}`),
        ];
      }
      case CallerIdMode.PASSTHROUGH:
      default:
        return [];
    }
  }

  private action(application: string, data: string): string {
    return `<action application="${this.escape(application)}" data="${this.escape(data)}"/>`;
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private regexEscape(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
