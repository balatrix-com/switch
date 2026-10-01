import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { CustomerPackage, CustomerPackagesApiResponse } from '../types';

/**
 * Fetch all plan packages/subscriptions for a given customer via the Switch API proxy.
 * Endpoint: GET /customers/:customer_id/packages (authenticated with Bearer token)
 */
export async function fetchCustomerPackages(customerId: string): Promise<CustomerPackage[]> {
  if (!customerId) return [];

  // Calls GET https://[SWITCH_API_URL]/customers/:customer_id/packages with Bearer auth
  const res = await api.get<CustomerPackage[] | CustomerPackagesApiResponse>(
    `/customers/${encodeURIComponent(customerId)}/packages`
  );

  // If payload is wrapped in { success: true, data: [...] }
  if (res && typeof res === 'object' && 'data' in res && Array.isArray(res.data)) {
    return res.data;
  }

  // If returned directly as an array
  return Array.isArray(res) ? res : [];
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
