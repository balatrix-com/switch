import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

interface CustomerIdOptions {
  required?: boolean;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Reads trusted tenant context supplied by the upstream application.
 * This is context extraction and validation only; it is not authentication.
 */
export const CustomerId = createParamDecorator(
  (options: CustomerIdOptions | undefined, context: ExecutionContext) => {
    const value = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>().headers['x-customer-id'];
    const required = options?.required ?? true;

    if (!value) {
      if (!required) return undefined;
      throw new BadRequestException('X-Customer-ID header is required');
    }
    if (Array.isArray(value) || !UUID_PATTERN.test(value)) {
      throw new BadRequestException(
        'X-Customer-ID must contain one valid customer UUID',
      );
    }
    return value;
  },
);
