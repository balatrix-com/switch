import { BadRequestException } from '@nestjs/common';
import { SourceType } from '@prisma/client';
import { SourceAuthService } from '../src/source-auth/source-auth.service';

describe('Source IP authentication address validation', () => {
  it('rejects a gateway display name before creating a database row', async () => {
    const create = jest.fn();
    const service = new SourceAuthService(
      { sourceIpAuth: { create } } as never,
      {} as never,
      {} as never,
    );
    await expect(service.create({
      sourceType: SourceType.CUSTOMER,
      customerId: '482692',
      ipAddress: 'Billing Switch Console',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });
});
