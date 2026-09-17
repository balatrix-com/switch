import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/auth.types';

interface CustomerIdOptions {
  required?: boolean;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CUSTOMER_CODE_PATTERN = /^\d{6}$/;

/**
 * Resolves tenant context from the verified JWT. Customer users can never
 * override their own tenant through parameters, query strings, or headers.
 */
export const CustomerId = createParamDecorator(
  (options: CustomerIdOptions | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      params?: Record<string, string | undefined>;
      query?: Record<string, string | undefined>;
      user?: AuthenticatedUser;
    }>();
    const required = options?.required ?? true;
    const user = request.user;

    if (user?.role === Role.CUSTOMER) {
      if (!user.customerId)
        throw new ForbiddenException(
          'User is not associated with an active customer',
        );
      return user.customerId;
    }

    const value =
      request.params?.customerId ||
      request.query?.customerId ||
      request.headers['x-customer-id'];

    if (user?.role !== Role.SUPER_ADMIN && user?.role !== Role.SUPPORT_MEMBER) {
      throw new ForbiddenException('Authenticated user context is required');
    }

    if (!value) {
      if (!required && user.role === Role.SUPER_ADMIN) return undefined;
      throw new BadRequestException(
        'customerId must be specified for this action',
      );
    }
    if (
      Array.isArray(value) ||
      (!UUID_PATTERN.test(value) && !CUSTOMER_CODE_PATTERN.test(value))
    ) {
      throw new BadRequestException(
        'X-Customer-ID must contain one valid six-digit customer code (legacy UUIDs remain supported)',
      );
    }
    if (user.role === Role.SUPPORT_MEMBER && !user.assignedCustomerIds?.includes(value)) {
      throw new ForbiddenException('Support Member is not assigned to this customer');
    }
    return value;
  },
);
