/**
 * Photobooth API client.
 * Typed functions for all photobooth-specific endpoints.
 */

import { apiClient } from './client';
import type {
  PhotoboothSnapResponse,
  FrameSelectRequest,
  ArrangeRequest,
  SessionResponse,
  ShareResponse,
  FeaturesResponse,
  ThemeResponse,
  ThemeCreateRequest,
  ThemeUpdateRequest,
  SuccessMessage,
} from './types';

export const photoboothApi = {
  // --- Kiosk-facing ---

  snap: (id: string) =>
    apiClient.post<PhotoboothSnapResponse>(`/kiosk/session/${id}/photobooth/snap`),

  doneCapture: (id: string) =>
    apiClient.post<SessionResponse>(`/kiosk/session/${id}/photobooth/done`),

  selectFrame: (id: string, data: FrameSelectRequest) =>
    apiClient.post<SessionResponse>(`/kiosk/session/${id}/photobooth/frame`, data),

  arrange: (id: string, data: ArrangeRequest) =>
    apiClient.post<SessionResponse>(`/kiosk/session/${id}/photobooth/arrange`, data, {
      timeout: 180000, // 3 minutes for composite generation
    }),

  getCompositeUrl: (id: string) =>
    `/api/v1/kiosk/session/${id}/photobooth/composite`,

  print: (id: string) =>
    apiClient.post<SuccessMessage>(`/kiosk/session/${id}/photobooth/print`),

  retake: (id: string) =>
    apiClient.post<SessionResponse>(`/kiosk/session/${id}/photobooth/retake`),

  share: (id: string) =>
    apiClient.get<ShareResponse>(`/kiosk/session/${id}/photobooth/share`),

  getFeatures: () =>
    apiClient.get<FeaturesResponse>('/kiosk/features'),

  // --- Theme listing (public for kiosk) ---

  listThemes: () =>
    apiClient.get<ThemeResponse[]>('/kiosk/photobooth/themes'),

  // --- Admin theme management ---

  listAllThemes: () =>
    apiClient.get<ThemeResponse[]>('/admin/photobooth/themes'),

  createTheme: (data: ThemeCreateRequest) =>
    apiClient.post<ThemeResponse>('/admin/photobooth/themes', data),

  updateTheme: (id: number, data: ThemeUpdateRequest) =>
    apiClient.put<ThemeResponse>(`/admin/photobooth/themes/${id}`, data),

  toggleTheme: (id: number, enabled: boolean) =>
    apiClient.patch<ThemeResponse>(`/admin/photobooth/themes/${id}/toggle`, { enabled }),

  setDefaultTheme: (id: number) =>
    apiClient.patch<ThemeResponse>(`/admin/photobooth/themes/${id}/default`),

  deleteTheme: (id: number) =>
    apiClient.delete(`/admin/photobooth/themes/${id}`),
};
