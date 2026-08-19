import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { NormalizationOwnerType } from '@prisma/client';
import { CustomerId } from '../common/decorators/customer-id.decorator';
import { CreateNormalizationProfileDto } from './dto/create-normalization-profile.dto';
import { UpdateNormalizationProfileDto } from './dto/update-normalization-profile.dto';
import { NormalizationProfilesService } from './normalization-profiles.service';

@ApiTags('Normalization Profiles')
@ApiHeader({
  name: 'X-Customer-ID',
  required: false,
  description:
    'Required for CUSTOMER-owned profiles; omit for GLOBAL/CARRIER profiles',
})
@Controller('normalization-profiles')
export class NormalizationController {
  constructor(private readonly profiles: NormalizationProfilesService) {}

  @Get()
  list(
    @CustomerId({ required: false }) customerId?: string,
    @Query('carrierId') carrierId?: string,
  ) {
    return this.profiles.list(customerId, carrierId);
  }

  @Post()
  create(
    @CustomerId({ required: false }) customerId: string | undefined,
    @Body() dto: CreateNormalizationProfileDto,
  ) {
    if (dto.ownerType === NormalizationOwnerType.CUSTOMER) {
      if (!customerId) {
        throw new BadRequestException(
          'X-Customer-ID is required for a CUSTOMER normalization profile',
        );
      }
      dto.customerId = customerId;
      dto.carrierId = undefined;
    }
    return this.profiles.create(dto);
  }

  @Patch(':id')
  update(
    @CustomerId({ required: false }) customerId: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateNormalizationProfileDto,
  ) {
    return this.profiles.update(id, customerId, dto);
  }
}
