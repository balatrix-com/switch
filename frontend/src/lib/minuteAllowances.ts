import type { CustomerPackage } from '../types';

export type MinuteAllowances = { tfn: number; did: number; outbound: number; general: number };

/** Only current plan entitlements count toward the displayed plan total. */
export function minuteAllowances(packages: CustomerPackage[]): MinuteAllowances {
  const totals = { tfn: 0, did: 0, outbound: 0, general: 0 };
  const now = Date.now();
  for (const pkg of packages) {
    if (pkg.status !== 'active' || (pkg.expires_at && Date.parse(pkg.expires_at) < now)) continue;
    const minutes = pkg.limits?.minutes;
    if (!minutes) continue;
    totals.tfn += Number(minutes.tfn || 0);
    totals.did += Number(minutes.did || 0);
    // The subscription API exposes untyped `free` and `total` pools, not an outbound bucket.
    totals.general += Number(minutes.free || 0) + Number(minutes.total || 0);
  }
  return totals;
}
