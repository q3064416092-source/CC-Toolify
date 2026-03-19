import apiClient from './client';
import type { BootstrapData } from '@/types';

export const fetchBootstrap = async (): Promise<BootstrapData> => {
  const response = await apiClient.get<BootstrapData>('/admin/api/bootstrap');
  return response.data;
};
