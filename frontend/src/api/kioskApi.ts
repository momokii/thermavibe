/**
 * Kiosk session API calls.
 * create, get, snap, select, retake, capture, print, finish.
 */
import apiClient from './client';
import type {
  SessionCreateRequest,
  SessionResponse,
  SnapResponse,
  SelectRequest,
  CaptureResponse,
  SessionFinishResponse,
  SuccessMessage,
} from './types';

export const kioskApi = {
  createSession: (data: SessionCreateRequest) =>
    apiClient.post<SessionResponse>('/kiosk/session', data),

  getSession: (id: string) =>
    apiClient.get<SessionResponse>(`/kiosk/session/${id}`),

  snap: (id: string) =>
    apiClient.post<SnapResponse>(`/kiosk/session/${id}/snap`),

  select: (id: string, data: SelectRequest) =>
    apiClient.post<CaptureResponse>(`/kiosk/session/${id}/select`, data, {
      timeout: 180000,
    }),

  retake: (id: string) =>
    apiClient.post<SessionResponse>(`/kiosk/session/${id}/retake`),

  capture: (id: string) =>
    apiClient.post<CaptureResponse>(`/kiosk/session/${id}/capture`, {
      timeout: 180000,
    }),

  print: (id: string, includePhoto = true) =>
    apiClient.post<SuccessMessage>(`/kiosk/session/${id}/print`, {
      include_photo: includePhoto,
    }),

  finish: (id: string) =>
    apiClient.post<SessionFinishResponse>(`/kiosk/session/${id}/finish`),
};
