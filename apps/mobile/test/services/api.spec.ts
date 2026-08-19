import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiRequest } from '@/services/api';
import { authService } from '@/services/auth';

vi.mock('@/services/auth', () => ({
  authService: {
    getToken: vi.fn(),
    refreshToken: vi.fn(),
  },
}));

const authMock = vi.mocked(authService);

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  authMock.getToken.mockReset();
  authMock.getToken.mockResolvedValue(null);
  authMock.refreshToken.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('apiRequest headers', () => {
  it('attaches the Bearer token and JSON Content-Type, and parses the response body', async () => {
    authMock.getToken.mockResolvedValue('tok-1');
    fetchMock.mockResolvedValue(jsonResponse(200, { items: [1, 2] }));

    const data = await apiRequest<{ items: number[] }>('/books');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/books');
    expect(init.headers.Authorization).toBe('Bearer tok-1');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(data).toEqual({ items: [1, 2] });
  });

  it('omits the Authorization header when no token is stored', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiRequest('/books');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('does not force Content-Type for FormData bodies', async () => {
    authMock.getToken.mockResolvedValue('tok-1');
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiRequest('/books/upload', { method: 'POST', body: new FormData() });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(init.headers.Authorization).toBe('Bearer tok-1');
  });

  it('lets caller-provided headers override the defaults', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiRequest('/books', { headers: { 'Content-Type': 'text/plain' } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['Content-Type']).toBe('text/plain');
  });

  it('returns undefined for a 204 response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(204, undefined));

    await expect(apiRequest('/books/b1', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});

describe('apiRequest 401 handling', () => {
  it('refreshes the token once and retries with the new token', async () => {
    authMock.getToken.mockResolvedValue('stale');
    authMock.refreshToken.mockResolvedValue('fresh');
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const data = await apiRequest('/me');

    expect(data).toEqual({ ok: true });
    expect(authMock.refreshToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh');
  });

  it('throws UNAUTHORIZED without a retry when refresh yields no token', async () => {
    authMock.refreshToken.mockResolvedValue(null);
    fetchMock.mockResolvedValue(jsonResponse(401, {}));

    await expect(apiRequest('/me')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
    // UNAUTHORIZED is not retryable — even for GET only one fetch happens
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws UNAUTHORIZED when the retried request still fails', async () => {
    authMock.refreshToken.mockResolvedValue('fresh');
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(403, {}));

    await expect(apiRequest('/me')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares a single refresh between concurrent 401s (mutex)', async () => {
    let resolveRefresh!: (token: string | null) => void;
    authMock.refreshToken.mockImplementation(
      () => new Promise<string | null>((r) => (resolveRefresh = r)),
    );
    let call = 0;
    fetchMock.mockImplementation(async () =>
      ++call <= 2 ? jsonResponse(401, {}) : jsonResponse(200, { call }),
    );

    const first = apiRequest('/a');
    const second = apiRequest('/b');
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authMock.refreshToken).toHaveBeenCalledTimes(1);

    resolveRefresh('fresh');
    await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer fresh');
    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe('Bearer fresh');
  });
});

describe('apiRequest failure codes', () => {
  it('maps an aborted request to a TIMEOUT error', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' }));

    await expect(apiRequest('/books', { method: 'POST' })).rejects.toMatchObject({
      status: 0,
      code: 'TIMEOUT',
      message: 'Request timeout',
    });
  });

  it('maps a fetch failure to a NETWORK_ERROR without retrying non-GET', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    await expect(apiRequest('/books', { method: 'POST' })).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws RATE_LIMIT on 429 without retrying', async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, {}));

    await expect(apiRequest('/books')).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMIT',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('extracts the error message from the response body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { message: 'Bad book id' }));

    await expect(apiRequest('/books', { method: 'POST' })).rejects.toMatchObject({
      status: 400,
      message: 'Bad book id',
    });
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => {
        throw new Error('invalid json');
      },
    } as unknown as Response);

    await expect(apiRequest('/books', { method: 'POST' })).rejects.toMatchObject({
      message: 'Request failed: 400',
    });
  });
});

describe('apiRequest GET retries', () => {
  it('retries GET on 5xx with backoff delays, then throws SERVER_ERROR', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse(500, { message: 'boom' }));

    const settled = apiRequest('/books').catch((e) => e);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const err = await settled;
    expect(err).toMatchObject({ status: 500, code: 'SERVER_ERROR', message: 'boom' });
  });

  it('succeeds on a later attempt after a transient failure', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const promise = apiRequest('/books');
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-GET requests on 5xx', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { message: 'boom' }));

    await expect(apiRequest('/books', { method: 'POST' })).rejects.toMatchObject({
      code: 'SERVER_ERROR',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
