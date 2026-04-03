import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

export const authService = {
  async getToken(): Promise<string | null> {
    return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },

  async setTokens(accessToken: string, refreshToken: string) {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  },

  async clearTokens() {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  },

  async login(email: string, password: string) {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || 'Login failed');
    }

    const data = await res.json();
    await this.setTokens(data.accessToken, data.refreshToken);
    return data;
  },

  async register(email: string, password: string, name: string) {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || 'Registration failed');
    }

    const data = await res.json();
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
