/**
 * Axios API client instance and shared configuration.
 * All API communication goes through this client.
 */
import axios from 'axios';
import { ADMIN_TOKEN_KEY } from '@/lib/constants';

const apiClient = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach admin JWT token to requests if available
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Clear token on 401 responses
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
    return Promise.reject(error);
  },
);

export default apiClient;
