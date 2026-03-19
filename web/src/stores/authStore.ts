import { create } from 'zustand';
import { login as loginApi, logout as logoutApi } from '@/api/auth';
import { fetchBootstrap } from '@/api/bootstrap';
import type { BootstrapData } from '@/types';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  bootstrap: BootstrapData | null;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadBootstrap: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: false,
  error: null,
  bootstrap: null,

  login: async (password: string) => {
    set({ isLoading: true, error: null });
    try {
      await loginApi(password);
      const bootstrap = await fetchBootstrap();
      set({ isAuthenticated: true, bootstrap, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '登录失败',
        isLoading: false,
      });
    }
  },

  logout: async () => {
    try {
      await logoutApi();
    } finally {
      set({ isAuthenticated: false, bootstrap: null, error: null });
    }
  },

  loadBootstrap: async () => {
    try {
      const bootstrap = await fetchBootstrap();
      set({ bootstrap, isAuthenticated: true });
    } catch {
      set({ isAuthenticated: false, bootstrap: null });
    }
  },

  clearError: () => set({ error: null }),
}));
