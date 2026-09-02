export type Counts = { endpoints: number; numbers: number; routes: number };

export type CustomerSettings = {
  defaultChannelLimit?: number | null;
  defaultCallerIdMode?: string;
  defaultCallerIdNumber?: string | null;
  defaultIngressProfileId?: string | null;
  defaultEgressProfileId?: string | null;
  defaultCallTimeoutSeconds?: number;
  defaultOutboundCarrierId?: string | null;
  defaultOutboundCarrierEndpointId?: string | null;
};

export type Customer = {
  id: string;
  accountCode: string;
  name: string;
  creditBalance?: string | number;
  currency?: string;
  isActive: boolean;
  createdAt?: string;
  settings?: CustomerSettings;
  _count?: Counts;
};

export type Endpoint = {
  id: string;
  name: string;
  host: string;
  port: number;
  transport: string;
  direction: string;
  authType: string;
  ingressNormalizationProfileId?: string | null;
  egressNormalizationProfileId?: string | null;
  channelLimit?: number | null;
  priority: number;
  isActive: boolean;
};

export type Carrier = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  defaultChannelLimit?: number | null;
  defaultIngressProfileId?: string | null;
  defaultEgressProfileId?: string | null;
  endpoints?: Endpoint[];
  routes?: CarrierRoute[];
  _count?: { endpoints: number; routes: number; sourceAuth: number };
};

export type CarrierRoute = {
  id: string;
  carrierEndpointId: string;
  name: string;
  matchPrefix: string;
  priority: number;
  cost?: string | number | null;
  channelLimit?: number | null;
  egressNormalizationProfileId?: string | null;
  isActive: boolean;
  carrierEndpoint?: Endpoint;
};

export type InventoryNumber = {
  id: string;
  canonicalNumber: string;
  displayNumber?: string | null;
  numberType: string;
  countryCode?: string | null;
  region?: string | null;
  status: string;
  metadata?: Record<string, unknown> | null;
  assignment?: {
    id: string;
    customerId: string;
    label?: string | null;
    status: string;
    customer?: Customer;
    settings?: NumberSettings | null;
  } | null;
};

export type NumberSettings = {
  destinationType?: string | null;
  primaryEndpointId?: string | null;
  forwardNumber?: string | null;
  failoverEndpointId?: string | null;
  failoverNumber?: string | null;
  callerIdMode?: string | null;
  callerIdNumber?: string | null;
  callTimeoutSeconds?: number | null;
  channelLimit?: number | null;
  egressNormalizationProfileId?: string | null;
  ingressNormalizationProfileId?: string | null;
  callerIdStripPrefix?: string | null;
  callerIdAddPrefix?: string | null;
};

export type CustomerNumber = {
  id: string;
  status: string;
  label?: string | null;
  inventory: InventoryNumber;
  settings?: NumberSettings | null;
  routes?: Route[];
  xml?: {
    version: number;
    generatedAt: string;
    fileName?: string | null;
  } | null;
};

export type Route = {
  id: string;
  customerId: string;
  customer?: Customer;
  name: string;
  direction: string;
  matchType: string;
  matchValue: string;
  priority: number;
  destinationType?: string | null;
  destinationNumber?: string | null;
  customerNumberId?: string | null;
  targetCustomerEndpointId?: string | null;
  targetCarrierId?: string | null;
  targetCarrierEndpointId?: string | null;
  failoverCustomerEndpointId?: string | null;
  failoverNumber?: string | null;
  ingressNormalizationProfileId?: string | null;
  egressNormalizationProfileId?: string | null;
  callerIdMode?: string | null;
  callerIdNumber?: string | null;
  callerIdStripPrefix?: string | null;
  callerIdAddPrefix?: string | null;
  callTimeoutSeconds?: number | null;
  targetCustomerEndpoint?: Endpoint | null;
  targetCarrierEndpoint?: Endpoint | null;
  channelLimit?: number | null;
  isActive: boolean;
  xml?: { version: number; generatedAt: string } | null;
};

export type NormalizationOperation =
  | "TRIM"
  | "DIGITS_ONLY"
  | "STRIP_PLUS"
  | "ENSURE_PLUS"
  | "STRIP_PREFIX"
  | "ADD_PREFIX"
  | "STRIP_LEADING_ONE"
  | "ENSURE_LEADING_ONE"
  | "REGEX_REPLACE";

export type NormalizationStep = {
  operation: NormalizationOperation;
  value?: string;
  pattern?: string;
  replacement?: string;
};

export type NormalizationProfile = {
  id: string;
  name: string;
  ownerType: "GLOBAL" | "CARRIER" | "CUSTOMER";
  customerId?: string | null;
  carrierId?: string | null;
  steps: NormalizationStep[];
  description?: string | null;
  isActive: boolean;
};

export type NormalizationResult = {
  raw: string;
  normalized: string;
  trace: Array<{
    operation: NormalizationOperation;
    before: string;
    after: string;
  }>;
};

export type RoutingResolution = {
  plan: {
    direction: string;
    customerId: string;
    routeId?: string;
    sourceType: string;
    rawDestinationNumber: string;
    lookupNumber: string;
    ingressNormalization: NormalizationResult;
    egressNormalizations: NormalizationResult[];
    callerIdMode: string;
    callerIdNumber?: string;
    callTimeoutSeconds: number;
    channelLimit?: number;
    primary?: {
      destinationType: string;
      host: string;
      port: number;
      transport: string;
      number: string;
    };
    failover?: {
      destinationType: string;
      host: string;
      port: number;
      transport: string;
      number: string;
    };
    rejectCause?: string;
  };
  xml: string;
};

export type SourceAuth = {
  id: string;
  sourceType: string;
  ipAddress: string;
  port: number;
  isActive: boolean;
  customerId?: string | null;
  carrierId?: string | null;
  customer?: Customer | null;
  carrier?: Carrier | null;
  customerEndpoint?: Endpoint | null;
  carrierEndpoint?: Endpoint | null;
};

export type BillingParty = "CUSTOMER" | "VENDOR";
export type RateCardType = "CUSTOMER" | "VENDOR";

export type MinimumBillingSetting = {
  id: string;
  name: string;
  party: BillingParty;
  initialIncrementSeconds: number;
  incrementSeconds: number;
  description?: string | null;
  isActive: boolean;
  _count?: { customerMappings: number; carrierMappings: number };
};

export type RateCard = {
  id: string;
  name: string;
  type: RateCardType;
  currency: string;
  description?: string | null;
  inboundRatePerMinute: string | number;
  inboundInitialIncrementSeconds: number;
  inboundIncrementSeconds: number;
  outboundRatePerMinute: string | number;
  outboundInitialIncrementSeconds: number;
  outboundIncrementSeconds: number;
  version: number;
  isActive: boolean;
  _count?: {
    customerMappings: number;
    carrierMappings: number;
  };
};

export type RateCardMapping = {
  customerId?: string;
  carrierId?: string;
  rateCardId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  customer?: Customer;
  carrier?: Carrier;
  rateCard: RateCard;
};

export type MinimumBillingMapping = {
  customerId?: string;
  carrierId?: string;
  settingId: string;
  customer?: Customer;
  carrier?: Carrier;
  setting: MinimumBillingSetting;
};

export type BillingMutation<T> = {
  data: T;
  cacheRefresh: {
    status: "success" | "error" | "skipped";
    message: string;
    details?: unknown;
  };
};

export type Cdr = {
  id: string;
  sessionUuid: string;
  customerId: string;
  direction: "INBOUND" | "OUTBOUND";
  callerNumber?: string | null;
  destinationNumber?: string | null;
  carrierId?: string | null;
  aLegSipCallId?: string | null;
  bLegSipCallIds?: string[];
  homerCaptureId?: number;
  startedAt?: string | null;
  answeredAt?: string | null;
  endedAt?: string | null;
  durationSeconds: number;
  billsec: number;
  carrierBillsec: number;
  callStatus: string;
  hangupCause?: string | null;
  ratingStatus: "PENDING" | "PROCESSING" | "RATED" | "ERROR" | "REVIEW";
  ratedSeconds?: number | null;
  carrierRatedSeconds?: number | null;
  currency: string;
  carrierCurrency?: string | null;
  sellRatePerMinute?: string | null;
  carrierRatePerMinute?: string | null;
  customerCharge?: string | null;
  carrierCost?: string | null;
  ratingError?: string | null;
};

export type SipTraceMessage = {
  id: string;
  callId: string;
  timestamp: string;
  timestampMs: number;
  method: string;
  methodText: string;
  responseCode: number | null;
  cseqMethod: string | null;
  caller: string | null;
  callee: string | null;
  srcIp: string;
  dstIp: string;
  srcPort: number;
  dstPort: number;
  captureId: number | null;
  node: string | null;
  correlationId: string | null;
  protocol: string;
  hasSdp: boolean;
  raw: string;
};

export type SipTraceFlowMessage = Omit<SipTraceMessage, "raw"> & {
  elapsedMs: number;
  fromIndex: number;
  toIndex: number;
  rawAvailable: boolean;
};

export type SipTraceSearchResponse = {
  data: SipTraceMessage[];
  total: number;
  window: { from: string; to: string };
};

export type SipTraceDetail = {
  call: {
    callId: string;
    startedAt: string | null;
    endedAt: string | null;
    durationMs: number;
    caller: string | null;
    callee: string | null;
    finalResponse: number | null;
    messageCount: number;
    participantCount: number;
  };
  callId: string;
  participants: string[];
  messages: SipTraceFlowMessage[];
};

export type SipTraceRawMessageResponse = {
  callId: string;
  data: {
    id: string;
    timestamp: string;
    method: string;
    raw: string;
  };
};

export type CustomerSipTrace = {
  id: string;
  cdrId: string;
  sessionUuid: string;
  callIds: string[];
  correlationId?: string | null;
  direction: "INBOUND" | "OUTBOUND";
  callerNumber?: string | null;
  calledNumber?: string | null;
  customerNumber?: string | null;
  status: string;
  responseCode?: number | null;
  durationSeconds: number;
  sourceIp?: string | null;
  destinationIp?: string | null;
  captureId: number;
  startedAt: string;
  endedAt?: string | null;
  hasSnapshot: boolean;
};

export type CustomerSipTraceList = {
  data: CustomerSipTrace[];
  limit: number;
  total: number;
};

export type GlobalSipTrace = CustomerSipTrace & {
  customer: {
    id: string;
    name: string;
    accountCode: string;
  };
};

export type GlobalSipTraceList = {
  data: GlobalSipTrace[];
  limit: number;
  total: number;
  window: { from: string | null; to: string | null };
};

export type PaginatedCdr = {
  data: Cdr[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
};
