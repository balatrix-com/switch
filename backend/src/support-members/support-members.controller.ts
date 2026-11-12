import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AssignSupportMemberDto } from './dto/assign-support-member.dto';
import { CreateSupportMemberDto } from './dto/create-support-member.dto';
import { ResetSupportPasswordDto } from './dto/reset-support-password.dto';
import { UpdateSupportMemberDto } from './dto/update-support-member.dto';
import { SupportMembersService } from './support-members.service';

@ApiTags('Support Members')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN)
@Controller('support-members')
export class SupportMembersController {
  constructor(private readonly members: SupportMembersService) {}

  @Get() list() { return this.members.list(); }
  @Post() create(@Body() dto: CreateSupportMemberDto) { return this.members.create(dto); }

  private customerId(user: AuthenticatedUser): string {
    if (!user.customerId) throw new ForbiddenException('Customer context is required');
    return user.customerId;
  }

  @Get('my')
  @Roles(Role.CUSTOMER)
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.members.listForCustomer(this.customerId(user));
  }

  @Post('my')
  @Roles(Role.CUSTOMER)
  createMine(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSupportMemberDto) {
    const customerId = this.customerId(user);
    if (dto.customerId && dto.customerId !== customerId)
      throw new ForbiddenException('You cannot create staff for another customer');
    return this.members.create({ ...dto, customerId });
  }

  @Patch('my/:id')
  @Roles(Role.CUSTOMER)
  async updateMine(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateSupportMemberDto) {
    await this.members.assertExclusiveCustomerMember(id, this.customerId(user));
    return this.members.update(id, dto);
  }

  @Post('my/:id/reset-password')
  @Roles(Role.CUSTOMER)
  async resetMine(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ResetSupportPasswordDto) {
    await this.members.assertExclusiveCustomerMember(id, this.customerId(user));
    return this.members.resetPassword(id, dto);
  }

  @Delete('my/:id')
  @Roles(Role.CUSTOMER)
  async removeMine(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.members.assertExclusiveCustomerMember(id, this.customerId(user));
    return this.members.remove(id);
  }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateSupportMemberDto) { return this.members.update(id, dto); }
  @Post(':id/reset-password') resetPassword(@Param('id') id: string, @Body() dto: ResetSupportPasswordDto) { return this.members.resetPassword(id, dto); }
  @Post(':id/assignments') assign(@Param('id') id: string, @Body() dto: AssignSupportMemberDto) { return this.members.assign(id, dto); }
  @Delete(':id/assignments/:customerId') unassign(@Param('id') id: string, @Param('customerId') customerId: string) { return this.members.unassign(id, customerId); }
  @Delete(':id') remove(@Param('id') id: string) { return this.members.remove(id); }
}
