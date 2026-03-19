import apiClient from './client';

export interface LoginRequest {
  password: string;
}

export interface LoginResponse {
  ok: boolean;
}

export const login = async (password: string): Promise<LoginResponse> => {
  const response = await apiClient.post<LoginResponse>('/admin/login', { password });
  return response.data;
};

export const logout = async (): Promise<void> => {
  await apiClient.post('/admin/logout');
};
