import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@shared/schema';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User | null, accessToken?: string, refreshToken?: string) => void;
  setUser: (user: User | null) => void;
  logout: () => void;
  getAccessToken: () => string | null;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      setAuth: (user, accessToken, refreshToken) => set({ 
        user, 
        accessToken: accessToken || null, 
        refreshToken: refreshToken || null,
        isAuthenticated: !!user 
      }),
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      logout: () => set({ 
        user: null, 
        accessToken: null, 
        refreshToken: null, 
        isAuthenticated: false 
      }),
      getAccessToken: () => get().accessToken,
    }),
    {
      name: 'harmony-auth-storage',
    }
  )
);

export function useAuth() {
  const { user, isAuthenticated, accessToken, refreshToken, setAuth, setUser, logout, getAccessToken } = useAuthStore();
  return { user, isAuthenticated, accessToken, refreshToken, setAuth, setUser, logout, getAccessToken };
}

export async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, setAuth, logout } = useAuthStore.getState();
  
  if (!refreshToken) {
    logout();
    return null;
  }

  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      logout();
      return null;
    }

    const data = await response.json();
    setAuth(data.user, data.accessToken, data.refreshToken);
    return data.accessToken;
  } catch {
    logout();
    return null;
  }
}
