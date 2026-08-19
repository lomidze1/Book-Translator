import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as SecureStore from 'expo-secure-store';
import { authService, AUTH_ERROR_CODES } from '@/services/auth';

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
});

describe('authService.login', () => {
  it('sends credentials with the x-mobile-client header and stores both tokens', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { accessToken: 'acc-1', refreshToken: 'ref-1', user: { id: 'u1' } }),
    );

    const data = await authService.login('me@example.com', 'secret123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/auth/login');
    expect(init.method).toBe('POST');
    expect(init.headers['x-mobile-client']).toBe('true');
    expect(JSON.parse(init.body)).toEqual({ email: 'me@example.com', password: 'secret123' });

    expect(data.accessToken).toBe('acc-1');
    expect(await authService.getToken()).toBe('acc-1');
    expect(await SecureStore.getItemAsync('refreshToken')).toBe('ref-1');
  });

  it('maps a 401 to the invalid-credentials error code', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Invalid email or password' }));

    await expect(authService.login('me@example.com', 'wrong')).rejects.toThrow(
      AUTH_ERROR_CODES.INVALID_CREDENTIALS,
    );
    expect(await authService.getToken()).toBeNull();
  });

  it('maps a fetch failure to the network error code', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    await expect(authService.login('me@example.com', 'secret123')).rejects.toThrow(
      AUTH_ERROR_CODES.NETWORK_ERROR,
    );
  });

  it('treats a 200 without tokens as a server error and stores nothing', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { accessToken: 'acc-only' }));

    await expect(authService.login('me@example.com', 'secret123')).rejects.toThrow(
      AUTH_ERROR_CODES.SERVER_ERROR,
    );
    expect(await authService.getToken()).toBeNull();
  });
});

describe('authService.register', () => {
  it('returns the verify-email payload without requiring tokens', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, { message: 'Verification email sent', userId: 'u1' }),
    );

    const data = await authService.register('me@example.com', 'secret123', 'გიორგი');

    expect(data).toEqual({ message: 'Verification email sent', userId: 'u1' });
    expect(await authService.getToken()).toBeNull();
  });

  it('stores tokens when the API does hand them out', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, { accessToken: 'acc-2', refreshToken: 'ref-2', user: { id: 'u1' } }),
    );

    await authService.register('me@example.com', 'secret123', 'გიორგი');

    expect(await authService.getToken()).toBe('acc-2');
  });

  it('maps duplicate-email failures to the email-exists code', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, { message: 'User with this email already exists' }),
    );

    await expect(authService.register('me@example.com', 'secret123', 'x')).rejects.toThrow(
      AUTH_ERROR_CODES.EMAIL_EXISTS,
    );
  });
});

describe('authService.refreshToken', () => {
  it('returns null without a network call when no refresh token is stored', async () => {
    expect(await authService.refreshToken()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rotates both tokens on success', async () => {
    await authService.setTokens('old-acc', 'old-ref');
    fetchMock.mockResolvedValue(
      jsonResponse(200, { accessToken: 'new-acc', refreshToken: 'new-ref' }),
    );

    const token = await authService.refreshToken();

    expect(token).toBe('new-acc');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['x-mobile-client']).toBe('true');
    expect(JSON.parse(init.body)).toEqual({ refreshToken: 'old-ref' });
    expect(await SecureStore.getItemAsync('refreshToken')).toBe('new-ref');
  });

  it('clears stored tokens when the server rejects the refresh', async () => {
    await authService.setTokens('old-acc', 'old-ref');
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Invalid refresh token' }));

    expect(await authService.refreshToken()).toBeNull();
    expect(await authService.getToken()).toBeNull();
  });

  it('clears stored tokens when the network fails', async () => {
    await authService.setTokens('old-acc', 'old-ref');
    fetchMock.mockRejectedValue(new TypeError('offline'));

    expect(await authService.refreshToken()).toBeNull();
    expect(await authService.getToken()).toBeNull();
  });
});

describe('authService.setTokens', () => {
  it.each([
    ['missing access token', undefined, 'ref'],
    ['missing refresh token', 'acc', undefined],
    ['non-string access token', 123, 'ref'],
  ])('rejects %s', async (_name, access, refresh) => {
    await expect(
      authService.setTokens(access as never, refresh as never),
    ).rejects.toThrow(AUTH_ERROR_CODES.TOKEN_ERROR);
  });
});

describe('authService.logout', () => {
  it('removes both stored tokens', async () => {
    await authService.setTokens('acc', 'ref');
    await authService.logout();

    expect(await authService.getToken()).toBeNull();
    expect(await SecureStore.getItemAsync('refreshToken')).toBeNull();
  });
});
