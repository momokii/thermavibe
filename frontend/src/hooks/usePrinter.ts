import { useMutation } from '@tanstack/react-query';
import { kioskApi } from '@/api/kioskApi';

export function usePrintReceipt() {
  return useMutation({
    mutationFn: ({ sessionId, includePhoto }: { sessionId: string; includePhoto?: boolean }) =>
      kioskApi.print(sessionId, includePhoto),
  });
}
