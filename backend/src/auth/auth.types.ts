import { Role } from '@prisma/client';

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  customerId: string | null;
  assignedCustomerIds?: string[];
};

export type JwtPayload = {
  sub: string;
  email: string;
  name: string | null;
  role: Role;
  customerId: string | null;
};
