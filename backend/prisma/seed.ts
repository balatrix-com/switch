import { NormalizationOwnerType, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const profiles = [
    {
      name: 'US NANP canonical 10-digit',
      steps: [
        { operation: 'TRIM' },
        { operation: 'STRIP_PLUS' },
        { operation: 'STRIP_LEADING_ONE' },
      ],
    },
    {
      name: 'E.164 add +1',
      steps: [
        { operation: 'TRIM' },
        { operation: 'ENSURE_LEADING_ONE' },
        { operation: 'ENSURE_PLUS' },
      ],
    },
  ];

  for (const profile of profiles) {
    const existing = await prisma.normalizationProfile.findFirst({
      where: { ownerType: NormalizationOwnerType.GLOBAL, name: profile.name },
    });
    if (!existing) {
      await prisma.normalizationProfile.create({
        data: { ...profile, ownerType: NormalizationOwnerType.GLOBAL },
      });
    }
  }
}

main()
  .finally(async () => prisma.$disconnect());
