import 'reflect-metadata';
import { NormalizationOwnerType } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateNormalizationProfileDto } from '../src/normalization/dto/create-normalization-profile.dto';

describe('CreateNormalizationProfileDto', () => {
  it('accepts the isActive field sent by the normalization profile editor', async () => {
    const dto = plainToInstance(CreateNormalizationProfileDto, {
      name: 'Carrier ingress',
      ownerType: NormalizationOwnerType.GLOBAL,
      steps: [],
      isActive: false,
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toHaveLength(0);
    expect(dto.isActive).toBe(false);
  });
});
