/**
 * Centralized API client.
 *
 * - Access token lives in-memory (set via `setAccessToken` from AuthContext on
 *   login / refresh). Never persisted to localStorage to prevent XSS theft.
 * - Refresh token lives in an httpOnly cookie set by the backend. The browser
 *   sends it automatically on /api/auth/refresh because we use `credentials: 'include'`.
 * - On 401 with a stored access token, a single-flight refresh is attempted.
 *   Concurrent 401s share the same refresh promise (no thundering herd).
 */

/**
 * Single source of truth for the backend URL. Components that need to call the
 * API should prefer `apiFetch` / `apiJson`, which already wire in auth-refresh
 * and credentials. When you genuinely need just the base URL (server-side
 * sitemaps, OG images, redirects), import this instead of re-reading the env
 * var — the previous pattern of redeclaring `const API_URL = process.env...`
 * existed in ~20 files and risked drift if the env name ever changed.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;
let onAuthFailure: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Hook called by AuthContext so the API client can trigger a sign-out when
 * the refresh attempt fails (e.g. refresh cookie expired or revoked).
 */
export function setAuthFailureHandler(handler: (() => void) | null): void {
  onAuthFailure = handler;
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { accessToken?: string };
      if (!data.accessToken) return null;
      accessToken = data.accessToken;
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export interface ApiFetchOptions extends RequestInit {
  /** Skip the auto-refresh retry on 401 (useful for the refresh endpoint itself). */
  skipRefresh?: boolean;
}

/**
 * Authenticated fetch. Attaches the in-memory access token, includes cookies
 * for refresh, and transparently retries once on 401 via /auth/refresh.
 */
export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { skipRefresh, headers, ...rest } = options;
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;

  const authHeader: Record<string, string> = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {};

  const res = await fetch(url, {
    ...rest,
    credentials: 'include',
    headers: { ...authHeader, ...(headers as Record<string, string> | undefined) },
  });

  if (res.status !== 401 || skipRefresh) return res;

  const newToken = await refreshAccessToken();
  if (!newToken) {
    onAuthFailure?.();
    return res;
  }

  // Retry once with the new token.
  return fetch(url, {
    ...rest,
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${newToken}`,
      ...(headers as Record<string, string> | undefined),
    },
  });
}

/** Convenience helper that parses the JSON body and throws on non-2xx. */
export async function apiJson<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = (body as { message?: string }).message || `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}
