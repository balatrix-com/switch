import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { CarriersModule } from './carriers/carriers.module';
import { CustomerEndpointsModule } from './customer-endpoints/customer-endpoints.module';
import { CustomerNumbersModule } from './customer-numbers/customer-numbers.module';
import { CustomersModule } from './customers/customers.module';
import { HealthModule } from './health/health.module';
import { NormalizationModule } from './normalization/normalization.module';
import { NumberInventoryModule } from './number-inventory/number-inventory.module';
import { PrismaModule } from './prisma/prisma.module';
import { RouteXmlModule } from './route-xml/route-xml.module';
import { RoutingModule } from './routing/routing.module';
import { SourceAuthModule } from './source-auth/source-auth.module';
import { SwitchRoutesModule } from './switch-routes/switch-routes.module';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { XmlCurlIntegrationModule } from './xml-curl-integration/xml-curl-integration.module';
import { BillingModule } from './billing/billing.module';
import { CdrModule } from './cdr/cdr.module';
import { SipTraceModule } from './sip-trace/sip-trace.module';
import { KamailioModule } from './kamailio/kamailio.module';
import { RecordingsModule } from './recordings/recordings.module';
import { LiveCallsModule } from './live-calls/live-calls.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { WalletModule } from './wallet/wallet.module';
import { SipUsersModule } from './sip-users/sip-users.module';
import { CustomerEntitlementsModule } from './customer-entitlements/customer-entitlements.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { SupportAccessGuard } from './auth/guards/support-access.guard';
import { SupportMembersModule } from './support-members/support-members.module';
import { InvoicesModule } from './invoices/invoices.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    KamailioModule,
    XmlCurlIntegrationModule,
    PrismaModule,
    HealthModule,
    NormalizationModule,
    CarriersModule,
    CustomersModule,
    CustomerEndpointsModule,
    SourceAuthModule,
    NumberInventoryModule,
    CustomerNumbersModule,
    SwitchRoutesModule,
    RouteXmlModule,
    RoutingModule,
    BillingModule,
    CdrModule,
    SipTraceModule,
    RecordingsModule,
    LiveCallsModule,
    SubscriptionModule,
    WalletModule,
    SipUsersModule,
    CustomerEntitlementsModule,
    AuthModule,
    SupportMembersModule,
    InvoicesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: SupportAccessGuard },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
  ],
})
export class AppModule {}
