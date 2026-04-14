import { authService } from './auth';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];

export interface ApiError {
  status: number;
  message: string;
  code?: 'NETWORK_ERROR' | 'TIMEOUT' | 'UNAUTHORIZED' | 'RATE_LIMIT' | 'SERVER_ERROR';
}

function createApiError(status: number, message: string, code?: ApiError['code']): ApiError & Error {
  const error = new Error(message) as ApiError & Error;
  error.status = status;
  error.code = code;
  return error;
}

// Mutex for token refresh — ensures only one refresh request at a time
let refreshPromise: Promise<string | null> | null = null;

function refreshTokenOnce(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = authService.refreshToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function isRetryableMethod(options?: RequestInit): boolean {
  const method = (options?.method || 'GET').toUpperCase();
  return method === 'GET';
}

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw createApiError(0, 'Request timeout', 'TIMEOUT');
    }
    throw createApiError(0, 'Network error', 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await authService.getToken();

  // FormData requires the runtime to set its own multipart boundary —
  // don't override Content-Type for multipart uploads.
  const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string> | undefined),
  };

  const url = `${API_URL}/api${path}`;
  const requestOptions: RequestInit = { ...options, headers };

  let lastError: Error | null = null;
  const retries = isRetryableMethod(options) ? MAX_RETRIES : 1;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt - 1]));
      }

      let res = await fetchWithTimeout(url, requestOptions);

      // Handle 401 — try refresh token once
      if (res.status === 401) {
        const newToken = await refreshTokenOnce();
        if (newToken) {
          const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
          res = await fetchWithTimeout(url, { ...requestOptions, headers: retryHeaders });
          if (res.ok || res.status === 204) {
            if (res.status === 204) return undefined as T;
            return res.json();
          }
        }
        throw createApiError(401, 'Unauthorized', 'UNAUTHORIZED');
      }

      if (res.status === 429) {
        throw createApiError(429, 'Too many requests', 'RATE_LIMIT');
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw createApiError(
          res.status,
          body.message || `Request failed: ${res.status}`,
          res.status >= 500 ? 'SERVER_ERROR' : undefined,
        );
      }

      if (res.status === 204) return undefined as T;
      return res.json();
    } catch (err: any) {
      lastError = err;

      // Only retry on network/timeout/server errors for GET requests
      const isRetryable = err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT' || err.code === 'SERVER_ERROR';
      if (!isRetryable || attempt >= retries - 1) {
        throw err;
      }
    }
  }

  throw lastError || createApiError(0, 'Request failed', 'NETWORK_ERROR');
}
