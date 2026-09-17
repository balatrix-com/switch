import { SupportAccess } from '../auth/decorators/support-access.decorator';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { CustomerId } from '../common/decorators/customer-id.decorator';
import { CreateSipUserDto } from './dto/create-sip-user.dto';
import { ResetSipPasswordDto } from './dto/reset-sip-password.dto';
import { UpdateSipUserDto } from './dto/update-sip-user.dto';
import { SipUsersService } from './sip-users.service';

@ApiTags('SIP Users')
@ApiHeader({ name: 'X-Customer-ID', required: true })
@SupportAccess()
@Controller('sip-users')
export class SipUsersController {
  constructor(private readonly sipUsers: SipUsersService) {}

  @Get() list(@CustomerId() customerId: string) {
    return this.sipUsers.list(customerId);
  }
  @Get('status') status(@CustomerId() customerId: string) {
    return this.sipUsers.status(customerId);
  }
  @Post() create(
    @CustomerId() customerId: string,
    @Body() dto: CreateSipUserDto,
  ) {
    return this.sipUsers.create(customerId, dto);
  }
  @Patch(':id') update(
    @CustomerId() customerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSipUserDto,
  ) {
    return this.sipUsers.update(customerId, id, dto);
  }
  @Post(':id/reset-password') resetPassword(
    @CustomerId() customerId: string,
    @Param('id') id: string,
    @Body() dto: ResetSipPasswordDto,
  ) {
    return this.sipUsers.resetPassword(customerId, id, dto.password);
  }
  @Delete(':id') remove(
    @CustomerId() customerId: string,
    @Param('id') id: string,
  ) {
    return this.sipUsers.remove(customerId, id);
  }
}
