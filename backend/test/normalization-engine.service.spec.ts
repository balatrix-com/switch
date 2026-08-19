import { BadRequestException } from '@nestjs/common';
import { NormalizationEngineService } from '../src/normalization/normalization-engine.service';
import { NormalizationOperation } from '../src/normalization/normalization.types';

describe('NormalizationEngineService', () => {
  const engine = new NormalizationEngineService();

  it('applies ordered carrier ingress rules before lookup', () => {
    const result = engine.apply(' +18005551234 ', [
      { operation: NormalizationOperation.TRIM },
      { operation: NormalizationOperation.STRIP_PREFIX, value: '+1' },
    ]);

    expect(result.normalized).toBe('8005551234');
    expect(result.trace).toHaveLength(2);
    expect(result.trace[1].before).toBe('+18005551234');
  });

  it('supports a deterministic egress chain', () => {
    const result = engine.apply('8005551234', [
      { operation: NormalizationOperation.ADD_PREFIX, value: '1' },
      { operation: NormalizationOperation.ENSURE_PLUS },
    ]);
    expect(result.normalized).toBe('+18005551234');
  });

  it('rejects invalid regular expressions', () => {
    expect(() =>
      engine.apply('123', [
        { operation: NormalizationOperation.REGEX_REPLACE, pattern: '[' },
      ]),
    ).toThrow(BadRequestException);
  });
});
