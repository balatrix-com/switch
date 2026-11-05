import type { CustomerPackage } from '../types';

export type MinuteAllowances = { did: number; outbound: number; general: number };

/** Only current plan entitlements count toward the displayed plan total. */
export function minuteAllowances(packages: CustomerPackage[]): MinuteAllowances {
  const totals = { did: 0, outbound: 0, general: 0 };
  const now = Date.now();
  for (const pkg of packages) {
    if (pkg.status !== 'active' || (pkg.expires_at && Date.parse(pkg.expires_at) < now)) continue;
    const minutes = pkg.limits?.minutes;
    if (!minutes) continue;
    totals.did += Number(minutes.did || 0) + Number(minutes.tfn || 0);
    totals.outbound += Number(minutes.free || 0);
    if (pkg.plan.category === 'minutes') {
      if (pkg.plan.type === 'DID' || pkg.plan.type === 'TFN') totals.did += Number(minutes.total || 0);
      else if (pkg.plan.type === 'OB') totals.outbound += Number(minutes.total || 0);
      else totals.general += Number(minutes.total || 0);
    }
  }
  return totals;
}
