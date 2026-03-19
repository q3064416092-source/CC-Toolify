import { create } from 'zustand';
import {
  fetchProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  testProvider,
} from '@/api/providers';
import type { Provider, ProviderInput } from '@/types';

interface ProviderState {
  providers: Provider[];
  isLoading: boolean;
  error: string | null;
  editingProvider: Provider | null;
  setProviders: (providers: Provider[]) => void;
  addProvider: (data: ProviderInput) => Promise<void>;
  editProvider: (id: string, data: ProviderInput) => Promise<void>;
  removeProvider: (id: string) => Promise<void>;
  testProvider: (id: string) => Promise<void>;
  setEditingProvider: (provider: Provider | null) => void;
  clearError: () => void;
  loadProviders: () => Promise<void>;
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: [],
  isLoading: false,
  error: null,
  editingProvider: null,

  setProviders: (providers) => set({ providers }),

  loadProviders: async () => {
    try {
      const providers = await fetchProviders();
      set({ providers });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '加载失败' });
    }
  },

  addProvider: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const provider = await createProvider(data);
      set({ providers: [...get().providers, provider], isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '创建失败',
        isLoading: false,
      });
      throw error;
    }
  },

  editProvider: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const provider = await updateProvider(id, data);
      set({
        providers: get().providers.map((p) => (p.id === id ? provider : p)),
        isLoading: false,
        editingProvider: null,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '更新失败',
        isLoading: false,
      });
      throw error;
    }
  },

  removeProvider: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await deleteProvider(id);
      set({
        providers: get().providers.filter((p) => p.id !== id),
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '删除失败',
        isLoading: false,
      });
      throw error;
    }
  },

  testProvider: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await testProvider(id);
      set({ isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '测试失败',
        isLoading: false,
      });
      throw error;
    }
  },

  setEditingProvider: (provider) => set({ editingProvider: provider }),
  clearError: () => set({ error: null }),
}));
