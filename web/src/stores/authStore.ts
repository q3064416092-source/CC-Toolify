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

const normalizeBootstrap = (payload: Partial<BootstrapData> | null | undefined): BootstrapData => ({
  providers: Array.isArray(payload?.providers) ? payload.providers : [],
  mappings: Array.isArray(payload?.mappings) ? payload.mappings : [],
  logs: Array.isArray(payload?.logs) ? payload.logs : [],
});

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: false,
  error: null,
  bootstrap: null,

  login: async (password: string) => {
    set({ isLoading: true, error: null });
    try {
      console.log('[authStore.login] start');
      await loginApi(password);
      const bootstrap = normalizeBootstrap(await fetchBootstrap());
      console.log('[authStore.login] success', {
        providers: bootstrap.providers.length,
        mappings: bootstrap.mappings.length,
        logs: bootstrap.logs.length,
      });
      set({ isAuthenticated: true, bootstrap, isLoading: false });
    } catch (error) {
      console.log('[authStore.login] failed', error);
      set({
        error: error instanceof Error ? error.message : '登录失败',
        isLoading: false,
      });
    }
  },

  logout: async () => {
    try {
      console.log('[authStore.logout] start');
      await logoutApi();
    } finally {
      console.log('[authStore.logout] clear state');
      set({ isAuthenticated: false, bootstrap: null, error: null });
    }
  },

  loadBootstrap: async () => {
    try {
      console.log('[authStore.loadBootstrap] start');
      const bootstrap = normalizeBootstrap(await fetchBootstrap());
      console.log('[authStore.loadBootstrap] success', {
        providers: bootstrap.providers.length,
        mappings: bootstrap.mappings.length,
        logs: bootstrap.logs.length,
      });
      set({ bootstrap, isAuthenticated: true });
    } catch (error) {
      console.log('[authStore.loadBootstrap] failed', error);
      set({ isAuthenticated: false, bootstrap: null });
    }
  },

  clearError: () => set({ error: null }),
}));


