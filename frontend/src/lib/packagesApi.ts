import { useCallback, useEffect, useState } from 'react';
import type { CustomerPackage, CustomerPackagesApiResponse } from '../types';

const SUBSCRIPTION_BASE = (
  import.meta.env.VITE_SUBSCRIPTION_SERVICE_URL || 'http://127.0.0.1:5010'
).replace(/\/$/, '');

/**
 * Fetch all plan packages/subscriptions for a given customer from the subscription service.
 * Endpoint: GET /management/customers/:customer_id/packages
 */
export async function fetchCustomerPackages(customerId: string): Promise<CustomerPackage[]> {
  if (!customerId) return [];

  const url = `${SUBSCRIPTION_BASE}/management/customers/${encodeURIComponent(customerId)}/packages`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    let errorMessage = `API error: HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson?.message) errorMessage = errJson.message;
    } catch {
      // ignore
    }
    throw new Error(errorMessage);
  }

  const json: CustomerPackagesApiResponse = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
}

/**
 * React hook to fetch and manage customer packages state
 */
export function useCustomerPackages(customerId?: string) {
  const [packages, setPackages] = useState<CustomerPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!customerId) {
      setPackages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchCustomerPackages(customerId);
      setPackages(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch customer packages');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { packages, loading, error, reload };
}

export const subscriptionBaseUrl = SUBSCRIPTION_BASE;
