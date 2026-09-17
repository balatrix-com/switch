import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser, JwtPayload } from './auth.types';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      include: {
        supportAssignments: { where: { customer: { isActive: true } }, include: { customer: { select: { id: true, name: true, accountCode: true, isActive: true } } } },
        customer: {
          include: {
            settings: true,
            _count: { select: { numbers: true, sipUsers: true, endpoints: true, routes: true } },
          },
        },
      },
    });
    if (!user || user.status !== UserStatus.ACTIVE || !(await bcrypt.compare(dto.password, user.passwordHash)))
      throw new UnauthorizedException('Invalid email or password');
    if (user.role === 'CUSTOMER' && (!user.customerId || !user.customer?.isActive))
      throw new UnauthorizedException('Customer account is inactive');
    const safeUser = this.safe(user);
    const payload: JwtPayload = {
      sub: safeUser.id,
      email: safeUser.email,
      name: safeUser.name,
      role: safeUser.role,
      customerId: safeUser.customerId,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: { ...safeUser, customer: user.customer, supportCustomers: (user.supportAssignments ?? []).map((assignment) => assignment.customer) },
    };
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: UserStatus.ACTIVE },
      include: {
        supportAssignments: { where: { customer: { isActive: true } }, include: { customer: { select: { id: true, name: true, accountCode: true, isActive: true } } } },
        customer: {
          include: {
            settings: true,
            _count: { select: { numbers: true, sipUsers: true, endpoints: true, routes: true } },
          },
        },
      },
    });
    if (!user) throw new UnauthorizedException('User account is inactive');
    return user;
  }

  async me(userId: string) {
    const user = await this.validateUser(userId);
    return { ...this.safe(user), customer: user.customer, supportCustomers: (user.supportAssignments ?? []).map((assignment) => assignment.customer) };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.validateUser(userId);
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash)))
      throw new UnauthorizedException('Current password is incorrect');
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) },
    });
    return { changed: true };
  }

  private safe(user: { id: string; email: string; name: string | null; role: AuthenticatedUser['role']; customerId: string | null }): AuthenticatedUser {
    return { id: user.id, email: user.email, name: user.name, role: user.role, customerId: user.customerId };
  }
}
