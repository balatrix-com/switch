import {
  CallerIdMode,
  DestinationType,
  RouteDirection,
  Transport,
} from '@prisma/client';
import { NormalizationResult } from '../normalization/normalization.types';

export interface ResolvedBridge {
  destinationType: DestinationType;
  host: string;
  port: number;
  transport: Transport;
  number: string;
}

export interface ResolvedCallPlan {
  direction: RouteDirection;
  customerId: string;
  carrierId?: string;
  carrierEndpointId?: string;
  routeId?: string;
  customerNumberId?: string;
  sourceType: 'CARRIER' | 'CUSTOMER';
  sourceId: string;
  rawDestinationNumber: string;
  lookupNumber: string;
  ingressNormalization: NormalizationResult;
  egressNormalizations: NormalizationResult[];
  callerIdMode: CallerIdMode;
  callerIdNumber?: string;
  callerIdStripPrefix?: string;
  callerIdAddPrefix?: string;
  callTimeoutSeconds?: number;
  channelLimit?: number;
  recordingEnabled?: boolean;
  primary?: ResolvedBridge;
  failover?: ResolvedBridge;
  rejectCause?: string;
}
