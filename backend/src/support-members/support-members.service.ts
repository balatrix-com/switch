import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AssignSupportMemberDto } from './dto/assign-support-member.dto';
import { CreateSupportMemberDto } from './dto/create-support-member.dto';
import { ResetSupportPasswordDto } from './dto/reset-support-password.dto';
import { UpdateSupportMemberDto } from './dto/update-support-member.dto';
import { ZeptoMailService } from '../email/zeptomail.service';

const publicSupportMember = {
  id: true, email: true, name: true, role: true, status: true, createdAt: true,
  supportAssignments: {
    select: { customerId: true, assignedAt: true, customer: { select: { id: true, name: true, accountCode: true, isActive: true } } },
    orderBy: { assignedAt: 'desc' as const },
  },
} as const;

@Injectable()
export class SupportMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly zeptoMail: ZeptoMailService,
  ) {}

  list() {
    return this.prisma.user.findMany({
      where: { role: Role.SUPPORT_MEMBER, status: { not: UserStatus.DELETED } },
      select: publicSupportMember,
      orderBy: { createdAt: 'desc' },
    });
  }

  listForCustomer(customerId: string) {
    return this.prisma.user.findMany({
      where: {
        role: Role.SUPPORT_MEMBER,
        status: { not: UserStatus.DELETED },
        supportAssignments: { some: { customerId }, every: { customerId } },
      },
      select: publicSupportMember,
      orderBy: { createdAt: 'desc' },
    });
  }

  async assertExclusiveCustomerMember(id: string, customerId: string) {
    const member = await this.prisma.user.findFirst({
      where: { id, role: Role.SUPPORT_MEMBER, status: { not: UserStatus.DELETED } },
      select: { supportAssignments: { select: { customerId: true } } },
    });
    if (!member || member.supportAssignments.length !== 1 || member.supportAssignments[0].customerId !== customerId)
      throw new NotFoundException('Support Member is not exclusively assigned to your customer');
  }

  private async member(id: string) {
    const member = await this.prisma.user.findFirst({
      where: { id, role: Role.SUPPORT_MEMBER, status: { not: UserStatus.DELETED } },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('Support Member not found');
    return member;
  }

  private async customer(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { isActive: true } });
    if (!customer || !customer.isActive) throw new NotFoundException('Active customer not found');
  }

  async create(dto: CreateSupportMemberDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } }))
      throw new ConflictException('An account with this email already exists');
    if (dto.customerId) await this.customer(dto.customerId);
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      const created = await this.prisma.user.create({
        data: {
          email, passwordHash, name: dto.name?.trim() || null,
          role: Role.SUPPORT_MEMBER, customerId: null,
          ...(dto.customerId ? { supportAssignments: { create: { customerId: dto.customerId } } } : {}),
        },
        select: publicSupportMember,
      });
      const credentialEmail = await this.zeptoMail.sendUserCredentials({
        email,
        password: dto.password,
        name: dto.name?.trim() || null,
        role: 'SUPPORT_MEMBER',
        customerId: dto.customerId || 'Support',
      });
      return { ...created, credentialEmail };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('An account with this email already exists');
      throw error;
    }
  }

  async update(id: string, dto: UpdateSupportMemberDto) {
    await this.member(id);
    if (dto.status === UserStatus.DELETED) throw new BadRequestException('Use the remove action to delete a Support Member');
    return this.prisma.user.update({
      where: { id },
      data: { ...(dto.name !== undefined ? { name: dto.name.trim() || null } : {}), ...(dto.status ? { status: dto.status } : {}) },
      select: publicSupportMember,
    });
  }

  async resetPassword(id: string, dto: ResetSupportPasswordDto) {
    await this.member(id);
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(dto.password, 12) } });
    return { changed: true };
  }

  async assign(id: string, dto: AssignSupportMemberDto) {
    await this.member(id);
    await this.customer(dto.customerId);
    const existing = await this.prisma.supportAssignment.findUnique({
      where: { supportMemberId_customerId: { supportMemberId: id, customerId: dto.customerId } },
    });
    if (existing) throw new ConflictException('Support Member is already assigned to this customer');
    try {
      await this.prisma.supportAssignment.create({ data: { supportMemberId: id, customerId: dto.customerId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Support Member is already assigned to this customer');
      throw error;
    }
    return this.prisma.user.findUnique({ where: { id }, select: publicSupportMember });
  }

  async unassign(id: string, customerId: string) {
    await this.member(id);
    const removed = await this.prisma.supportAssignment.deleteMany({ where: { supportMemberId: id, customerId } });
    if (!removed.count) throw new NotFoundException('Support assignment not found');
    return { removed: true };
  }

  async remove(id: string) {
    await this.member(id);
    await this.prisma.$transaction([
      this.prisma.supportAssignment.deleteMany({ where: { supportMemberId: id } }),
      this.prisma.user.update({ where: { id }, data: { status: UserStatus.DELETED } }),
    ]);
    return { removed: true };
  }
}
