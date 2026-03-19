import axios, { AxiosError, AxiosInstance } from 'axios';

const apiClient: AxiosInstance = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response) {
      // Server responded with error status
      const data = error.response.data as { error?: string };
      throw new Error(data.error || `请求失败 (${error.response.status})`);
    } else if (error.request) {
      // Request was made but no response
      throw new Error('网络错误，请检查连接');
    } else {
      // Something else happened
      throw new Error(error.message || '未知错误');
    }
  }
);

export default apiClient;
