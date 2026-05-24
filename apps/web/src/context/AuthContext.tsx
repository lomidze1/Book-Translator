'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import {
  apiFetch,
  apiJson,
  setAccessToken,
  setAuthFailureHandler,
} from '@/lib/api-client';

interface User {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  role: 'USER' | 'ADMIN';
}

interface AuthContextType {
  user: User | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  /**
   * Called after a successful login response. The refresh token lives in an
   * httpOnly cookie set by the backend; we only stash the access token in
   * memory + the user profile in localStorage (non-sensitive cache).
   */
  login: (accessToken: string, user: User) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function getCachedUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('cachedUser');
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<User>;
    // Reject caches saved before `role` joined the user envelope. The silent
    // refresh + /users/profile fetch will repopulate with a fresh, complete
    // user; rendering the stale shape would briefly say "not admin" for an
    // actual admin and flicker the admin-panel link.
    if (typeof parsed.id !== 'string' || (parsed.role !== 'USER' && parsed.role !== 'ADMIN')) {
      localStorage.removeItem('cachedUser');
      return null;
    }
    return parsed as User;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Track whether the cookie-based silent refresh has been attempted yet, so
  // we don't show a "logged out" flicker on first paint.
  const bootstrapped = useRef(false);

  const clearLocalAuth = useCallback(() => {
    setAccessToken(null);
    try {
      localStorage.removeItem('cachedUser');
    } catch {}
    setUser(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/auth/logout`,
        { method: 'POST', credentials: 'include' },
      );
    } catch {
      // Network failure — clear local state anyway.
    }
    clearLocalAuth();
  }, [clearLocalAuth]);

  const login = useCallback((accessToken: string, userData: User) => {
    setAccessToken(accessToken);
    try {
      localStorage.setItem('cachedUser', JSON.stringify(userData));
    } catch {}
    setUser(userData);
  }, []);

  useEffect(() => {
    // Wire the API client so refresh failures bounce the user.
    setAuthFailureHandler(clearLocalAuth);
    return () => setAuthFailureHandler(null);
  }, [clearLocalAuth]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    // Restore cached user immediately to avoid flash-of-logged-out state.
    const cached = getCachedUser();
    if (cached) setUser(cached);

    let cancelled = false;

    (async () => {
      try {
        // Try a silent refresh — succeeds when the httpOnly refresh cookie is
        // present and valid; fails cleanly for first-time visitors.
        const refreshRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/auth/refresh`,
          { method: 'POST', credentials: 'include' },
        );

        if (!refreshRes.ok) {
          if (!cancelled) clearLocalAuth();
          return;
        }

        const { accessToken } = (await refreshRes.json()) as { accessToken: string };
        setAccessToken(accessToken);

        // Re-fetch the canonical profile so cached UI matches the server.
        const profile = await apiJson<User>('/api/users/profile');
        if (cancelled) return;
        try {
          localStorage.setItem('cachedUser', JSON.stringify(profile));
        } catch {}
        setUser(profile);
      } catch {
        // Don't blow away cached user on a transient network failure.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearLocalAuth]);

  return (
    <AuthContext.Provider value={{ user, isLoggedIn: !!user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Re-exported so call sites can issue authenticated requests without importing
// from two different modules.
export { apiFetch, apiJson };
