import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth.types';
import { SUPPORT_ACCESS_KEY } from '../decorators/support-access.decorator';

@Injectable()
export class SupportAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (user?.role !== Role.SUPPORT_MEMBER) return true;
    const allowed = this.reflector.getAllAndOverride<boolean>(SUPPORT_ACCESS_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (!allowed) throw new ForbiddenException('Support Members cannot access this API');
    return true;
  }
}
