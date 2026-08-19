const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3100/api/v1').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  customerId?: string;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.customerId) headers.set('X-Customer-ID', options.customerId);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError('Cannot reach the billing switch API. Check that the backend is running.', 0);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = Array.isArray(payload?.message)
      ? payload.message.join(', ')
      : payload?.message || `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, customerId?: string) => request<T>(path, { customerId }),
  post: <T>(path: string, body: unknown, customerId?: string) => request<T>(path, { method: 'POST', body, customerId }),
  patch: <T>(path: string, body: unknown, customerId?: string) => request<T>(path, { method: 'PATCH', body, customerId }),
  delete: <T>(path: string, customerId?: string) => request<T>(path, { method: 'DELETE', customerId }),
};

export const apiBaseUrl = API_BASE;
