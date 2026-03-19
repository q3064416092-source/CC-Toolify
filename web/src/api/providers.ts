import apiClient from './client';
import type { Provider, ProviderInput, TestProviderResult } from '@/types';

export const fetchProviders = async (): Promise<Provider[]> => {
  const response = await apiClient.get<Provider[]>('/admin/api/providers');
  return response.data;
};

export const createProvider = async (data: ProviderInput): Promise<Provider> => {
  const response = await apiClient.post<Provider>('/admin/api/providers', data);
  return response.data;
};

export const updateProvider = async (id: string, data: ProviderInput): Promise<Provider> => {
  const response = await apiClient.put<Provider>(`/admin/api/providers/${id}`, data);
  return response.data;
};

export const deleteProvider = async (id: string): Promise<void> => {
  await apiClient.delete(`/admin/api/providers/${id}`);
};

export const testProvider = async (id: string): Promise<TestProviderResult> => {
  const response = await apiClient.post<TestProviderResult>(`/admin/api/providers/${id}/test`, {});
  return response.data;
};
