import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

// Stable error codes — UI translates via i18n (auth.errors.<code>)
export const AUTH_ERROR_CODES = {
  LOGIN_FAILED: 'auth.errors.login_failed',
  REGISTER_FAILED: 'auth.errors.register_failed',
  INVALID_CREDENTIALS: 'auth.errors.invalid_credentials',
  EMAIL_EXISTS: 'auth.errors.email_exists',
  WEAK_PASSWORD: 'auth.errors.weak_password',
  NETWORK_ERROR: 'auth.errors.network_error',
  SERVER_ERROR: 'auth.errors.server_error',
  TOKEN_ERROR: 'auth.errors.token_error',
  VALIDATION: 'auth.errors.validation',
  RATE_LIMIT: 'auth.errors.rate_limit',
} as const;

function classifyError(message: string, fallback: string): string {
  const lower = message.toLowerCase().replace(/_/g, ' ');
  if (lower.includes('invalid credentials') || lower.includes('unauthorized') || lower.includes('invalid email or password')) {
    return AUTH_ERROR_CODES.INVALID_CREDENTIALS;
  }
  if (lower.includes('email already exists') || lower.includes('already exists') || lower.includes('already registered') || lower.includes('duplicate') || lower.includes('unique constraint')) {
    return AUTH_ERROR_CODES.EMAIL_EXISTS;
  }
  if (lower.includes('password') && (lower.includes('weak') || lower.includes('short') || lower.includes('at least') || lower.includes('must'))) {
    return AUTH_ERROR_CODES.WEAK_PASSWORD;
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('econnrefused')) {
    return AUTH_ERROR_CODES.NETWORK_ERROR;
  }
  if (lower.includes('not found') || lower.includes('no user')) {
    return AUTH_ERROR_CODES.INVALID_CREDENTIALS;
  }
  if (lower.includes('validation') || lower.includes('invalid')) {
    return AUTH_ERROR_CODES.VALIDATION;
  }
  if (lower.includes('too many') || lower.includes('rate limit') || lower.includes('throttle')) {
    return AUTH_ERROR_CODES.RATE_LIMIT;
  }
  return fallback;
}

export const authService = {
  async getToken(): Promise<string | null> {
    return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },

  async setTokens(accessToken: string, refreshToken: string) {
    // Guard against undefined/null values — SecureStore only accepts strings
    if (!accessToken || typeof accessToken !== 'string') {
      throw new Error(AUTH_ERROR_CODES.TOKEN_ERROR);
    }
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new Error(AUTH_ERROR_CODES.TOKEN_ERROR);
    }
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  },

  async clearTokens() {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  },

  async login(email: string, password: string) {
    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new Error(AUTH_ERROR_CODES.NETWORK_ERROR);
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(classifyError(body.message || '', AUTH_ERROR_CODES.LOGIN_FAILED));
    }

    const data = await res.json();

    if (!data.accessToken || !data.refreshToken) {
      throw new Error(AUTH_ERROR_CODES.SERVER_ERROR);
    }

    await this.setTokens(data.accessToken, data.refreshToken);
    return data;
  },

  async register(email: string, password: string, name: string) {
    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
    } catch {
      throw new Error(AUTH_ERROR_CODES.NETWORK_ERROR);
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(classifyError(body.message || '', AUTH_ERROR_CODES.REGISTER_FAILED));
    }

    const data = await res.json();

    if (!data.accessToken || !data.refreshToken) {
      throw new Error(AUTH_ERROR_CODES.SERVER_ERROR);
    }

    await this.setTokens(data.accessToken, data.refreshToken);
    return data;
  },

  async refreshToken(): Promise<string | null> {
    const refresh = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (!refresh) return null;

    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });

      if (!res.ok) {
        await this.clearTokens();
        return null;
      }

      const data = await res.json();

      if (!data.accessToken || !data.refreshToken) {
        await this.clearTokens();
        return null;
      }

      await this.setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch {
      await this.clearTokens();
      return null;
    }
  },

  async logout() {
    await this.clearTokens();
  },
};
