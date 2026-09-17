import { NormalizationOwnerType, NumberInventoryStatus, PrismaClient, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_DEV_CUSTOMER_CLEANUP !== 'true'
  ) {
    throw new Error(
      'Refusing to clean customer data in production. Set ALLOW_DEV_CUSTOMER_CLEANUP=true only if this is intentional.',
    );
  }

  const email = (process.env.SUPERADMIN_EMAIL || 'admin@switchboard.local')
    .trim()
    .toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD || 'Admin@123456';
  const passwordHash = await bcrypt.hash(password, 12);

  const result = await prisma.$transaction(async (tx) => {
    const customers = await tx.customer.findMany({ select: { id: true } });
    const customerIds = customers.map(({ id }) => id);
    const assignments = customerIds.length
      ? await tx.customerNumber.findMany({
          where: { customerId: { in: customerIds } },
          select: { inventoryId: true },
        })
      : [];
    const inventoryIds = assignments.map(({ inventoryId }) => inventoryId);

    if (customerIds.length) {
      await tx.customerSipTrace.deleteMany({ where: { customerId: { in: customerIds } } });
      await tx.routeXml.deleteMany({ where: { customerId: { in: customerIds } } });
      await tx.numberSettings.deleteMany({ where: { customerId: { in: customerIds } } });
      await tx.switchRoute.deleteMany({ where: { customerId: { in: customerIds } } });
      await tx.sourceIpAuth.deleteMany({ where: { customerId: { in: customerIds } } });
      await tx.customerNumber.deleteMany({ where: { customerId: { in: customerIds } } });
      if (inventoryIds.length) {
        await tx.globalNumberInventory.updateMany({
          where: { id: { in: inventoryIds } },
          data: { status: NumberInventoryStatus.AVAILABLE },
        });
      }
      await tx.customerEndpoint.deleteMany({ where: { customerId: { in: customerIds } } });
      await tx.sipUser.deleteMany({ where: { customerId: { in: customerIds } } });
      await tx.customerRateCard.deleteMany({ where: { customerId: { in: customerIds } } });
      await tx.customerMinimumBilling.deleteMany({ where: { customerId: { in: customerIds } } });
      await tx.customerSettings.deleteMany({ where: { customerId: { in: customerIds } } });
      await tx.normalizationProfile.deleteMany({
        where: {
          customerId: { in: customerIds },
          ownerType: NormalizationOwnerType.CUSTOMER,
        },
      });
      await tx.user.deleteMany({ where: { customerId: { in: customerIds } } });
      await tx.customer.deleteMany({ where: { id: { in: customerIds } } });
    }

    const admin = await tx.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        name: 'Super Administrator',
        role: Role.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      },
      update: {
        passwordHash,
        name: 'Super Administrator',
        role: Role.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        customerId: null,
      },
      select: { id: true, email: true, role: true },
    });

    return {
      deletedCustomers: customerIds.length,
      releasedInventoryNumbers: inventoryIds.length,
      admin,
    };
  }, { maxWait: 15_000, timeout: 60_000 });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
