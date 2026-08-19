import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CustomerId } from '../common/decorators/customer-id.decorator';
import { CustomerEndpointsService } from './customer-endpoints.service';
import { CreateCustomerEndpointDto } from './dto/create-customer-endpoint.dto';
import { UpdateCustomerEndpointDto } from './dto/update-customer-endpoint.dto';

@ApiTags('Customer Endpoints')
@ApiSecurity('customer-context')
@Controller('customer-endpoints')
export class CustomerEndpointsController {
  constructor(private readonly endpoints: CustomerEndpointsService) {}

  @Get()
  list(@CustomerId() customerId: string) {
    return this.endpoints.list(customerId);
  }

  @Post()
  create(
    @CustomerId() customerId: string,
    @Body() dto: CreateCustomerEndpointDto,
  ) {
    return this.endpoints.create(customerId, dto);
  }

  @Patch(':id')
  update(
    @CustomerId() customerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerEndpointDto,
  ) {
    return this.endpoints.update(customerId, id, dto);
  }

  @Delete(':id')
  remove(@CustomerId() customerId: string, @Param('id') id: string) {
    return this.endpoints.remove(customerId, id);
  }
}
