import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../auth.types';
import { jwtSecret } from '../jwt-secret';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret(config),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, status: 'ACTIVE' },
      include: {
        customer: { select: { isActive: true } },
        supportAssignments: { where: { customer: { isActive: true } }, select: { customerId: true } },
      },
    });
    if (!user || (user.role === 'CUSTOMER' && !user.customer?.isActive))
      throw new UnauthorizedException('Account is inactive');
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      customerId: user.customerId,
      assignedCustomerIds: user.supportAssignments.map((assignment) => assignment.customerId),
    };
  }
}
