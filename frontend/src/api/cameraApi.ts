/**
 * Camera API calls.
 * stream URL, devices, select.
 */
import apiClient from './client';
import type { CameraListResponse, CameraSelectRequest, CameraSelectResponse } from './types';

export const cameraApi = {
  getDevices: () =>
    apiClient.get<CameraListResponse>('/camera/devices'),

  selectDevice: (data: CameraSelectRequest) =>
    apiClient.post<CameraSelectResponse>('/camera/select', data),

  getStreamUrl: (resolution = '1280x720', fps = 15, quality = 85) =>
    `/api/v1/camera/stream?resolution=${resolution}&fps=${fps}&quality=${quality}`,
};
