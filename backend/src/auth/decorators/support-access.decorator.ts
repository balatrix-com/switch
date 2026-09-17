import { SetMetadata } from '@nestjs/common';

export const SUPPORT_ACCESS_KEY = 'support-access';

/** Explicitly opts customer-scoped APIs into Support Member access. */
export const SupportAccess = () => SetMetadata(SUPPORT_ACCESS_KEY, true);
