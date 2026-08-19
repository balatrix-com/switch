import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { SourceType } from '@prisma/client';
import { CustomerId } from '../common/decorators/customer-id.decorator';
import { CreateSourceAuthDto } from './dto/create-source-auth.dto';
import { SourceAuthService } from './source-auth.service';

@ApiTags('SIP Source Identification')
@ApiHeader({
  name: 'X-Customer-ID',
  required: false,
  description: 'Required for CUSTOMER source entries; omit for CARRIER entries',
})
@Controller('source-ip-auth')
export class SourceAuthController {
  constructor(private readonly sourceAuth: SourceAuthService) {}

  @Get()
  list(@CustomerId({ required: false }) customerId?: string) {
    return this.sourceAuth.list(customerId);
  }

  @Post()
  create(
    @CustomerId({ required: false }) customerId: string | undefined,
    @Body() dto: CreateSourceAuthDto,
  ) {
    if (dto.sourceType === SourceType.CUSTOMER) {
      if (!customerId) {
        throw new BadRequestException(
          'X-Customer-ID is required for a CUSTOMER source entry',
        );
      }
      dto.customerId = customerId;
      dto.carrierId = undefined;
      dto.carrierEndpointId = undefined;
    }
    return this.sourceAuth.create(dto);
  }

  @Delete(':id')
  remove(
    @CustomerId({ required: false }) customerId: string | undefined,
    @Param('id') id: string,
  ) {
    return this.sourceAuth.remove(id, customerId);
  }
}
