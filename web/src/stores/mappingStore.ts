import { create } from 'zustand';
import {
  fetchMappings,
  createMapping,
  updateMapping,
  deleteMapping,
  testMapping,
} from '@/api/mappings';
import type { ModelMapping, ModelMappingInput } from '@/types';

interface MappingState {
  mappings: ModelMapping[];
  isLoading: boolean;
  error: string | null;
  editingMapping: ModelMapping | null;
  setMappings: (mappings: ModelMapping[]) => void;
  addMapping: (data: ModelMappingInput) => Promise<void>;
  editMapping: (id: string, data: ModelMappingInput) => Promise<void>;
  removeMapping: (id: string) => Promise<void>;
  testMapping: (id: string) => Promise<void>;
  setEditingMapping: (mapping: ModelMapping | null) => void;
  clearError: () => void;
  loadMappings: () => Promise<void>;
}

export const useMappingStore = create<MappingState>((set, get) => ({
  mappings: [],
  isLoading: false,
  error: null,
  editingMapping: null,

  setMappings: (mappings) => set({ mappings }),

  loadMappings: async () => {
    try {
      const mappings = await fetchMappings();
      set({ mappings });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '加载失败' });
    }
  },

  addMapping: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const mapping = await createMapping(data);
      set({ mappings: [...get().mappings, mapping], isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '创建失败',
        isLoading: false,
      });
      throw error;
    }
  },

  editMapping: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const mapping = await updateMapping(id, data);
      set({
        mappings: get().mappings.map((m) => (m.id === id ? mapping : m)),
        isLoading: false,
        editingMapping: null,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '更新失败',
        isLoading: false,
      });
      throw error;
    }
  },

  removeMapping: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await deleteMapping(id);
      set({
        mappings: get().mappings.filter((m) => m.id !== id),
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

  testMapping: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await testMapping(id);
      set({ isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '测试失败',
        isLoading: false,
      });
      throw error;
    }
  },

  setEditingMapping: (mapping) => set({ editingMapping: mapping }),
  clearError: () => set({ error: null }),
}));
