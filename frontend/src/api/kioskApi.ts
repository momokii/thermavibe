/**
 * Kiosk session API calls.
 * create, get, capture, print, finish.
 */
import apiClient from './client';
import type {
  SessionCreateRequest,
  SessionResponse,
  CaptureResponse,
  SessionFinishResponse,
  SuccessMessage,
} from './types';

export const kioskApi = {
  createSession: (data: SessionCreateRequest) =>
    apiClient.post<SessionResponse>('/kiosk/session', data),

  getSession: (id: string) =>
    apiClient.get<SessionResponse>(`/kiosk/session/${id}`),

  capture: (id: string) =>
    apiClient.post<CaptureResponse>(`/kiosk/session/${id}/capture`),

  print: (id: string, includePhoto = true) =>
    apiClient.post<SuccessMessage>(`/kiosk/session/${id}/print`, {
      include_photo: includePhoto,
    }),

  finish: (id: string) =>
    apiClient.post<SessionFinishResponse>(`/kiosk/session/${id}/finish`),
};
