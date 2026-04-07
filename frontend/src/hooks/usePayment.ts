/**
 * Payment hooks - stubbed for future use when payment is enabled.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { paymentApi } from '@/api/paymentApi';
import type { CreateQRRequest } from '@/api/types';

export function useCreateQR() {
  return useMutation({
    mutationFn: (data: CreateQRRequest) => paymentApi.createQR(data),
  });
}

export function usePaymentStatus(sessionId: string | null) {
  return useQuery({
    queryKey: ['payment-status', sessionId],
    queryFn: () => paymentApi.getStatus(sessionId!).then((r) => r.data),
    enabled: !!sessionId,
    refetchInterval: 3000,
  });
}
