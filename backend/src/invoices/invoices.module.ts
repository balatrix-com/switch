import { Module } from '@nestjs/common';
import { SubscriptionModule } from '../subscription/subscription.module';
import { EmailModule } from '../email/email.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({ imports: [SubscriptionModule, EmailModule], controllers: [InvoicesController], providers: [InvoicesService] })
export class InvoicesModule {}
