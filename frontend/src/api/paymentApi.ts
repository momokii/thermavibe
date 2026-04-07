/**
 * Payment API calls.
 * create QR, status polling.
 * Stubbed for future use when payment is enabled.
 */
import apiClient from './client';
import type { CreateQRRequest, CreateQRResponse, PaymentStatusResponse } from './types';

export const paymentApi = {
  createQR: (data: CreateQRRequest) =>
    apiClient.post<CreateQRResponse>('/payment/create-qr', data),

  getStatus: (sessionId: string) =>
    apiClient.get<PaymentStatusResponse>(`/payment/status/${sessionId}`),
};
