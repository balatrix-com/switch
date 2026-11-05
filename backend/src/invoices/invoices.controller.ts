import { Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { GenerateInvoiceDto } from './dto/generate-invoice.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
@Roles(Role.SUPER_ADMIN)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post('preview') preview(@Body() dto: GenerateInvoiceDto) { return this.invoices.preview(dto); }
  @Post('generate') async generate(@Body() dto: GenerateInvoiceDto) { const invoice = await this.invoices.generate(dto); return { ...invoice, items: invoice.items.map((item) => ({ ...item, id: item.id.toString() })) }; }
  @Get() list(@Query('customerId') customerId?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string) { return this.invoices.list(customerId, Number(page) || 1, Number(pageSize) || 25, startDate, endDate); }
  @Get(':id/print') @Header('Content-Type', 'text/html; charset=utf-8') print(@Param('id') id: string) { return this.invoices.html(id); }
  @Get(':id/cdr.csv') @Header('Content-Type', 'text/csv; charset=utf-8') cdrCsv(@Param('id') id: string) { return this.invoices.cdrCsv(id); }
  @Post(':id/send-email') sendEmail(@Param('id') id: string) { return this.invoices.sendEmail(id); }
  @Get(':id') async get(@Param('id') id: string) { const invoice = await this.invoices.get(id); return { ...invoice, items: invoice.items.map((item) => ({ ...item, id: item.id.toString() })) }; }
}
