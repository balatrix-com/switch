import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BillingParty, RateCardType } from '@prisma/client';
import { BillingService } from './billing.service';
import {
  AssignMinimumBillingDto,
  AssignRateCardDto,
  CreateMinimumBillingSettingDto,
  CreateRateCardDto,
  UpdateMinimumBillingSettingDto,
  UpdateRateCardDto,
  UploadRateCardDto,
} from './dto/billing.dto';

@ApiTags('Billing and Rate Cards')
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('rate-cards')
  listRateCards(@Query('type') type?: RateCardType) {
    return this.billing.listRateCards(type);
  }

  @Get('rate-cards/:id')
  getRateCard(@Param('id') id: string) {
    return this.billing.getRateCard(id);
  }

  @Post('rate-cards')
  createRateCard(@Body() dto: CreateRateCardDto) {
    return this.billing.createRateCard(dto);
  }

  @Patch('rate-cards/:id')
  updateRateCard(@Param('id') id: string, @Body() dto: UpdateRateCardDto) {
    return this.billing.updateRateCard(id, dto);
  }

  @Delete('rate-cards/:id')
  removeRateCard(@Param('id') id: string) {
    return this.billing.removeRateCard(id);
  }

  @Post('rate-cards/:id/upload')
  uploadRateCard(@Param('id') id: string, @Body() dto: UploadRateCardDto) {
    return this.billing.uploadItems(id, dto);
  }

  @Get('rate-card-mappings/customers')
  listCustomerMappings() {
    return this.billing.listCustomerMappings();
  }

  @Put('rate-card-mappings/customers/:customerId')
  assignCustomerRateCard(
    @Param('customerId') customerId: string,
    @Body() dto: AssignRateCardDto,
  ) {
    return this.billing.assignCustomerRateCard(customerId, dto);
  }

  @Delete('rate-card-mappings/customers/:customerId')
  removeCustomerRateCard(@Param('customerId') customerId: string) {
    return this.billing.removeCustomerRateCard(customerId);
  }

  @Get('rate-card-mappings/carriers')
  listCarrierMappings() {
    return this.billing.listCarrierMappings();
  }

  @Put('rate-card-mappings/carriers/:carrierId')
  assignCarrierRateCard(
    @Param('carrierId') carrierId: string,
    @Body() dto: AssignRateCardDto,
  ) {
    return this.billing.assignCarrierRateCard(carrierId, dto);
  }

  @Delete('rate-card-mappings/carriers/:carrierId')
  removeCarrierRateCard(@Param('carrierId') carrierId: string) {
    return this.billing.removeCarrierRateCard(carrierId);
  }

  @Get('minimum-billing/settings')
  listMinimumSettings(@Query('party') party?: BillingParty) {
    return this.billing.listMinimumSettings(party);
  }

  @Post('minimum-billing/settings')
  createMinimumSetting(@Body() dto: CreateMinimumBillingSettingDto) {
    return this.billing.createMinimumSetting(dto);
  }

  @Patch('minimum-billing/settings/:id')
  updateMinimumSetting(
    @Param('id') id: string,
    @Body() dto: UpdateMinimumBillingSettingDto,
  ) {
    return this.billing.updateMinimumSetting(id, dto);
  }

  @Delete('minimum-billing/settings/:id')
  removeMinimumSetting(@Param('id') id: string) {
    return this.billing.removeMinimumSetting(id);
  }

  @Get('minimum-billing/mappings')
  listMinimumMappings() {
    return this.billing.listMinimumMappings();
  }

  @Put('minimum-billing/customers/:customerId')
  assignCustomerMinimum(
    @Param('customerId') customerId: string,
    @Body() dto: AssignMinimumBillingDto,
  ) {
    return this.billing.assignCustomerMinimum(customerId, dto);
  }

  @Delete('minimum-billing/customers/:customerId')
  removeCustomerMinimum(@Param('customerId') customerId: string) {
    return this.billing.removeCustomerMinimum(customerId);
  }

  @Put('minimum-billing/carriers/:carrierId')
  assignCarrierMinimum(
    @Param('carrierId') carrierId: string,
    @Body() dto: AssignMinimumBillingDto,
  ) {
    return this.billing.assignCarrierMinimum(carrierId, dto);
  }

  @Delete('minimum-billing/carriers/:carrierId')
  removeCarrierMinimum(@Param('carrierId') carrierId: string) {
    return this.billing.removeCarrierMinimum(carrierId);
  }

  @Post('billing/cache/refresh')
  refreshCache() {
    return this.billing.refreshCache();
  }
}
