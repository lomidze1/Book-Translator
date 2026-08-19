import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as SecureStore from 'expo-secure-store';

const h = vi.hoisted(() => ({
  promptAsync: vi.fn(),
}));

vi.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: vi.fn(() => [{ ready: true }, null, h.promptAsync]),
}));

vi.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: vi.fn(),
}));

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// isGoogleConfigured is computed at module scope from env — re-import per test.
async function loadHook() {
  vi.resetModules();
  const { useGoogleAuth } = await import('@/services/google-auth');
  return useGoogleAuth();
}

beforeEach(() => {
  fetchMock.mockReset();
  h.promptAsync.mockReset();
  vi.stubEnv('EXPO_PUBLIC_GOOGLE_CLIENT_ID', 'web-client-id');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('useGoogleAuth.signIn', () => {
  it('exchanges the id token with the x-mobile-client header and stores both tokens', async () => {
    h.promptAsync.mockResolvedValue({ type: 'success', params: { id_token: 'id-tok' } });
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        accessToken: 'acc-1',
        refreshToken: 'ref-1',
        user: { id: 'u1', email: 'me@example.com', name: 'გიორგი', avatar: null },
      }),
    );

    const { signIn } = await loadHook();
    const data = await signIn();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/auth/google');
    expect(init.method).toBe('POST');
    expect(init.headers['x-mobile-client']).toBe('true');
    expect(JSON.parse(init.body)).toEqual({ idToken: 'id-tok' });

    expect(data.accessToken).toBe('acc-1');
    expect(await SecureStore.getItemAsync('accessToken')).toBe('acc-1');
    expect(await SecureStore.getItemAsync('refreshToken')).toBe('ref-1');
  });

  it.each(['cancel', 'dismiss'] as const)('throws CANCELLED when the session is %sed', async (type) => {
    h.promptAsync.mockResolvedValue({ type });

    const { signIn } = await loadHook();

    await expect(signIn()).rejects.toThrow('CANCELLED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails when the auth session errors out', async () => {
    h.promptAsync.mockResolvedValue({ type: 'error' });

    const { signIn } = await loadHook();

    await expect(signIn()).rejects.toThrow('Google authentication failed');
  });

  it('fails when the session succeeds without an id token', async () => {
    h.promptAsync.mockResolvedValue({ type: 'success', params: {} });

    const { signIn } = await loadHook();

    await expect(signIn()).rejects.toThrow('Google authentication failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the server error message on a non-ok response', async () => {
    h.promptAsync.mockResolvedValue({ type: 'success', params: { id_token: 'id-tok' } });
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Bad Google token' }));

    const { signIn } = await loadHook();

    await expect(signIn()).rejects.toThrow('Bad Google token');
  });

  it('falls back to a generic error when the failure body is not JSON', async () => {
    h.promptAsync.mockResolvedValue({ type: 'success', params: { id_token: 'id-tok' } });
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('invalid json');
      },
    } as unknown as Response);

    const { signIn } = await loadHook();

    await expect(signIn()).rejects.toThrow('Google authentication failed');
  });

  it('rejects a 200 that is missing tokens and stores nothing', async () => {
    h.promptAsync.mockResolvedValue({ type: 'success', params: { id_token: 'id-tok' } });
    fetchMock.mockResolvedValue(jsonResponse(200, { accessToken: 'acc-only' }));

    const { signIn } = await loadHook();

    await expect(signIn()).rejects.toThrow('Invalid server response');
    expect(await SecureStore.getItemAsync('accessToken')).toBeNull();
  });
});

describe('useGoogleAuth configuration', () => {
  it('reports isConfigured when the web client id is set', async () => {
    const { isConfigured } = await loadHook();

    expect(isConfigured).toBe(true);
  });

  it('refuses to sign in when Google auth is not configured', async () => {
    vi.stubEnv('EXPO_PUBLIC_GOOGLE_CLIENT_ID', '');

    const { signIn, isConfigured } = await loadHook();

    expect(isConfigured).toBe(false);
    await expect(signIn()).rejects.toThrow('Google auth not configured');
    expect(h.promptAsync).not.toHaveBeenCalled();
  });
});
