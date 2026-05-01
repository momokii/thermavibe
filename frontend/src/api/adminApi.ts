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
  FeatureBreakdownResponse,
  HardwareStatusResponse,
  PrintTestResponse,
  PrintStatusResponse,
  CameraListResponse,
  CameraSelectResponse,
  StripGalleryResponse,
  VibeCheckResultsResponse,
  AccessCodeListResponse,
  AccessCodeCreateRequest,
  AccessCodeResponse,
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

  getFeatureBreakdown: (params?: { start_date?: string; end_date?: string }) =>
    apiClient.get<FeatureBreakdownResponse>('/admin/analytics/features', { params }),

  getHardwareStatus: () =>
    apiClient.get<HardwareStatusResponse>('/admin/hardware/status'),

  testCamera: () =>
    apiClient.post('/admin/hardware/camera/test', null, { responseType: 'blob' }),

  listCameras: () =>
    apiClient.get<CameraListResponse>('/camera/devices'),

  selectCamera: (deviceIndex: number) =>
    apiClient.post<CameraSelectResponse>('/camera/select', { device_index: deviceIndex }),

  selectPrinter: (vendorId: string, productId: string) =>
    apiClient.post<PrintStatusResponse>('/printer/select', { vendor_id: vendorId, product_id: productId }),

  testPrinter: () =>
    apiClient.post<PrintTestResponse>('/admin/hardware/printer/test'),

  listPrinters: () =>
    apiClient.get<{ devices: Array<{ vendor_id: string; product_id: string; description: string }> }>('/printer/devices'),

  getStrips: (params?: { limit?: number; offset?: number }) =>
    apiClient.get<StripGalleryResponse>('/admin/photobooth/strips', { params }),

  getVibeCheckResults: (params?: { limit?: number; offset?: number }) =>
    apiClient.get<VibeCheckResultsResponse>('/admin/vibe-check/results', { params }),

  // --- Access Codes ---

  listAccessCodes: (params?: { status?: string; code_type?: string; limit?: number; offset?: number }) =>
    apiClient.get<AccessCodeListResponse>('/admin/access-codes', { params }),

  createAccessCodes: (data: AccessCodeCreateRequest) =>
    apiClient.post<AccessCodeResponse[]>('/admin/access-codes', data),

  revokeAccessCode: (codeId: number) =>
    apiClient.patch<AccessCodeResponse>(`/admin/access-codes/${codeId}/revoke`),

  deleteAccessCode: (codeId: number) =>
    apiClient.delete(`/admin/access-codes/${codeId}`),

  getAccessCodeQr: (codeId: number) =>
    apiClient.get(`/admin/access-codes/${codeId}/qr`, { responseType: 'blob' }),
};
