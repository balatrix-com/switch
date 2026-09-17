import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
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
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateSupportMemberDto) { return this.members.update(id, dto); }
  @Post(':id/reset-password') resetPassword(@Param('id') id: string, @Body() dto: ResetSupportPasswordDto) { return this.members.resetPassword(id, dto); }
  @Post(':id/assignments') assign(@Param('id') id: string, @Body() dto: AssignSupportMemberDto) { return this.members.assign(id, dto); }
  @Delete(':id/assignments/:customerId') unassign(@Param('id') id: string, @Param('customerId') customerId: string) { return this.members.unassign(id, customerId); }
  @Delete(':id') remove(@Param('id') id: string) { return this.members.remove(id); }
}
