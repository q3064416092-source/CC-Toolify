import apiClient from './client';
import type { ModelMapping, ModelMappingInput, TestMappingResult } from '@/types';

export const fetchMappings = async (): Promise<ModelMapping[]> => {
  const response = await apiClient.get<ModelMapping[]>('/admin/api/mappings');
  return response.data;
};

export const createMapping = async (data: ModelMappingInput): Promise<ModelMapping> => {
  const response = await apiClient.post<ModelMapping>('/admin/api/mappings', data);
  return response.data;
};

export const updateMapping = async (id: string, data: ModelMappingInput): Promise<ModelMapping> => {
  const response = await apiClient.put<ModelMapping>(`/admin/api/mappings/${id}`, data);
  return response.data;
};

export const deleteMapping = async (id: string): Promise<void> => {
  await apiClient.delete(`/admin/api/mappings/${id}`);
};

export const testMapping = async (id: string): Promise<TestMappingResult> => {
  const response = await apiClient.post<TestMappingResult>(`/admin/api/mappings/${id}/test`, {});
  return response.data;
};
