import { describe, it, expect, vi, afterEach } from 'vitest';

// config.ts reads process.env at module scope — stub env, then re-import.
async function loadConfig() {
  vi.resetModules();
  return import('@/config');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('API_URL', () => {
  it('strips trailing slashes from EXPO_PUBLIC_API_URL', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.example.com/');

    const { API_URL } = await loadConfig();

    expect(API_URL).toBe('https://api.example.com');
  });

  it('strips multiple trailing slashes', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.example.com///');

    const { API_URL } = await loadConfig();

    expect(API_URL).toBe('https://api.example.com');
  });

  it('keeps a clean URL unchanged', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.example.com');

    const { API_URL } = await loadConfig();

    expect(API_URL).toBe('https://api.example.com');
  });

  it('falls back to localhost:4000 in dev when EXPO_PUBLIC_API_URL is unset', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', '');

    const { API_URL } = await loadConfig();

    expect(API_URL).toBe('http://localhost:4000');
  });

  // The release-build throw ("EXPO_PUBLIC_API_URL is not set") cannot be
  // exercised here: __DEV__ is inlined as `true` by the vitest `define`
  // option at transform time, so the branch is unreachable at runtime.
});

describe('PURCHASES_ENABLED', () => {
  it.each([
    ['true', true],
    ['TRUE', false],
    ['1', false],
    ['false', false],
    ['', false],
  ])('is %s → %s (only the exact string "true" enables it)', async (value, expected) => {
    vi.stubEnv('EXPO_PUBLIC_ENABLE_PURCHASES', value);

    const { PURCHASES_ENABLED } = await loadConfig();

    expect(PURCHASES_ENABLED).toBe(expected);
  });
});

describe('TTS_ENABLED', () => {
  it('is enabled only by the exact string "true"', async () => {
    vi.stubEnv('EXPO_PUBLIC_ENABLE_TTS', 'true');
    expect((await loadConfig()).TTS_ENABLED).toBe(true);

    vi.stubEnv('EXPO_PUBLIC_ENABLE_TTS', 'yes');
    expect((await loadConfig()).TTS_ENABLED).toBe(false);

    vi.stubEnv('EXPO_PUBLIC_ENABLE_TTS', '');
    expect((await loadConfig()).TTS_ENABLED).toBe(false);
  });
});

describe('WEB_URL', () => {
  it('defaults to the public site when unset', async () => {
    vi.stubEnv('EXPO_PUBLIC_WEB_URL', '');

    const { WEB_URL } = await loadConfig();

    expect(WEB_URL).toBe('https://booktranslator.ge');
  });

  it('uses the configured value when set', async () => {
    vi.stubEnv('EXPO_PUBLIC_WEB_URL', 'https://staging.booktranslator.ge');

    const { WEB_URL } = await loadConfig();

    expect(WEB_URL).toBe('https://staging.booktranslator.ge');
  });
});
