import { vi, beforeEach } from 'vitest';

// ── Native module stand-ins ──────────────────────────────────────────────
// Services import these Expo/RN modules at module scope; vitest runs in
// plain Node, so each gets an in-memory fake with the same surface.

const secureStore = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (k: string) => secureStore.get(k) ?? null),
  setItemAsync: vi.fn(async (k: string, v: string) => {
    if (typeof v !== 'string') throw new Error('SecureStore accepts only strings');
    secureStore.set(k, v);
  }),
  deleteItemAsync: vi.fn(async (k: string) => {
    secureStore.delete(k);
  }),
}));

const asyncStore = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (k: string) => asyncStore.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      asyncStore.set(k, v);
    }),
    removeItem: vi.fn(async (k: string) => {
      asyncStore.delete(k);
    }),
    getAllKeys: vi.fn(async () => [...asyncStore.keys()]),
    multiRemove: vi.fn(async (keys: string[]) => {
      keys.forEach((k) => asyncStore.delete(k));
    }),
    clear: vi.fn(async () => {
      asyncStore.clear();
    }),
  },
}));

// Expose the backing stores so tests can seed/inspect them.
export const __secureStore = secureStore;
export const __asyncStore = asyncStore;

beforeEach(() => {
  secureStore.clear();
  asyncStore.clear();
});
