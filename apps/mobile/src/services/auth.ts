import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

// Error messages in Georgian
const ERRORS = {
  login_failed: 'შესვლა ვერ მოხერხდა',
  register_failed: 'რეგისტრაცია ვერ მოხერხდა',
  invalid_credentials: 'არასწორი ელ-ფოსტა ან პაროლი',
  email_exists: 'ეს ელ-ფოსტა უკვე რეგისტრირებულია',
  weak_password: 'პაროლი ძალიან სუსტია (მინიმუმ 8 სიმბოლო)',
  network_error: 'ქსელის შეცდომა. შეამოწმეთ ინტერნეტ კავშირი',
  server_error: 'სერვერის შეცდომა. სცადეთ მოგვიანებით',
  token_error: 'ავტორიზაციის შეცდომა. ხელახლა შედით',
};

function translateError(message: string): string {
  const lower = message.toLowerCase().replace(/_/g, ' ');
  if (lower.includes('invalid credentials') || lower.includes('unauthorized') || lower.includes('invalid email or password')) {
    return ERRORS.invalid_credentials;
  }
  if (lower.includes('email already exists') || lower.includes('already exists') || lower.includes('already registered') || lower.includes('duplicate') || lower.includes('unique constraint')) {
    return ERRORS.email_exists;
  }
  if (lower.includes('password') && (lower.includes('weak') || lower.includes('short') || lower.includes('at least') || lower.includes('must'))) {
    return ERRORS.weak_password;
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('econnrefused')) {
    return ERRORS.network_error;
  }
  if (lower.includes('not found') || lower.includes('no user')) {
    return ERRORS.invalid_credentials;
  }
  if (lower.includes('validation') || lower.includes('invalid')) {
    return 'შეყვანილი მონაცემები არასწორია';
  }
  if (lower.includes('too many') || lower.includes('rate limit') || lower.includes('throttle')) {
    return 'ძალიან ბევრი მცდელობა. სცადეთ მოგვიანებით';
  }
  return message;
}

export const authService = {
  async getToken(): Promise<string | null> {
    return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },

  async setTokens(accessToken: string, refreshToken: string) {
    // Guard against undefined/null values — SecureStore only accepts strings
    if (!accessToken || typeof accessToken !== 'string') {
      throw new Error(ERRORS.token_error);
    }
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new Error(ERRORS.token_error);
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
      throw new Error(ERRORS.network_error);
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(translateError(body.message || ERRORS.login_failed));
    }

    const data = await res.json();

    if (!data.accessToken || !data.refreshToken) {
      throw new Error(ERRORS.server_error);
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
      throw new Error(ERRORS.network_error);
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(translateError(body.message || ERRORS.register_failed));
    }

    const data = await res.json();

    if (!data.accessToken || !data.refreshToken) {
      throw new Error(ERRORS.server_error);
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
