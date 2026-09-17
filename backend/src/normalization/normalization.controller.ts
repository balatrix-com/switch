import { SupportAccess } from '../auth/decorators/support-access.decorator';
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
import { NormalizationOwnerType, Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
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
@SupportAccess()
@Controller('normalization-profiles')
export class NormalizationController {
  constructor(private readonly profiles: NormalizationProfilesService) {}

  @Get()
  list(
    @CustomerId({ required: false }) customerId?: string,
    @Query('carrierId') carrierId?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (user?.role !== Role.SUPER_ADMIN) carrierId = undefined;
    return this.profiles.list(customerId, carrierId);
  }

  @Post()
  create(
    @CustomerId({ required: false }) customerId: string | undefined,
    @Body() dto: CreateNormalizationProfileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (
      user.role !== Role.SUPER_ADMIN &&
      dto.ownerType !== NormalizationOwnerType.CUSTOMER
    ) {
      throw new BadRequestException(
        'Customer and Support Member users can only create customer normalization profiles',
      );
    }
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
