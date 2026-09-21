import { resolveDidRecordingEnabled } from '../src/route-xml/recording-policy';

describe('DID recording policy', () => {
  it.each([
    [false, undefined, false],
    [false, true, false],
    [true, undefined, true],
    [true, null, true],
    [true, true, true],
    [true, false, false],
  ])(
    'customer=%s override=%s resolves to %s',
    (customerEnabled, numberOverride, expected) => {
      expect(resolveDidRecordingEnabled(customerEnabled, numberOverride)).toBe(
        expected,
      );
    },
  );
});
