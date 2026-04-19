/**
 * Admin API calls.
 * login, config, analytics, hardware.
 */
import apiClient from './client';
import type {
  LoginRequest,
  LoginResponse,
  ConfigAllResponse,
  ConfigUpdateResponse,
  SessionAnalyticsResponse,
  RevenueAnalyticsResponse,
  HardwareStatusResponse,
  PrintTestResponse,
  CameraListResponse,
  CameraSelectResponse,
} from './types';

export const adminApi = {
  login: (data: LoginRequest) =>
    apiClient.post<LoginResponse>('/admin/login', data),

  getConfig: () =>
    apiClient.get<ConfigAllResponse>('/admin/config'),

  updateConfig: (category: string, values: Record<string, unknown>) =>
    apiClient.put<ConfigUpdateResponse>(`/admin/config/${category}`, values),

  getSessionAnalytics: (params?: { start_date?: string; end_date?: string; group_by?: string }) =>
    apiClient.get<SessionAnalyticsResponse>('/admin/analytics/sessions', { params }),

  getRevenueAnalytics: (params?: { start_date?: string; end_date?: string; group_by?: string }) =>
    apiClient.get<RevenueAnalyticsResponse>('/admin/analytics/revenue', { params }),

  getHardwareStatus: () =>
    apiClient.get<HardwareStatusResponse>('/admin/hardware/status'),

  testCamera: () =>
    apiClient.post('/admin/hardware/camera/test', null, { responseType: 'blob' }),

  listCameras: () =>
    apiClient.get<CameraListResponse>('/camera/devices'),

  selectCamera: (deviceIndex: number) =>
    apiClient.post<CameraSelectResponse>('/camera/select', { device_index: deviceIndex }),

  testPrinter: () =>
    apiClient.post<PrintTestResponse>('/admin/hardware/printer/test'),
};
