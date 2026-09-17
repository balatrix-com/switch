const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3100/api/v1').replace(/\/$/, '');
const TOKEN_KEY = 'billing-switch.access-token';

export const authToken = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

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
  const token = authToken.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);
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
    if (response.status === 401 && token) {
      authToken.clear();
      window.dispatchEvent(new Event('billing-switch:unauthorized'));
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, customerId?: string) => request<T>(path, { customerId }),
  post: <T>(path: string, body: unknown, customerId?: string) => request<T>(path, { method: 'POST', body, customerId }),
  put: <T>(path: string, body: unknown, customerId?: string) => request<T>(path, { method: 'PUT', body, customerId }),
  patch: <T>(path: string, body: unknown, customerId?: string) => request<T>(path, { method: 'PATCH', body, customerId }),
  delete: <T>(path: string, customerId?: string) => request<T>(path, { method: 'DELETE', customerId }),
};

export const apiBaseUrl = API_BASE;
