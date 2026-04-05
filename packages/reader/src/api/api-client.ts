let _apiUrl = 'http://localhost:4000';

/** Set the API base URL. Call once at app init. */
export function setApiUrl(url: string) {
  _apiUrl = url;
}

export function getApiUrl(): string {
  return _apiUrl;
}

export async function apiRequest<T>(
  basePath: string,
  path: string,
  token: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${_apiUrl}/api${basePath}${path}`, {
    ...options,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
