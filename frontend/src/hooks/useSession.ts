import { useMutation, useQuery } from '@tanstack/react-query';
import { kioskApi } from '@/api/kioskApi';

export function useCreateSession() {
  return useMutation({
    mutationFn: (data: { payment_enabled: boolean }) =>
      kioskApi.createSession(data),
  });
}

export function useCapture() {
  return useMutation({
    mutationFn: (id: string) => kioskApi.capture(id),
  });
}

export function useSession(id: string | null, options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: ['session', id],
    queryFn: () => kioskApi.getSession(id!).then((r) => r.data),
    enabled: !!id,
    refetchInterval: options?.refetchInterval,
  });
}

export function usePrint() {
  return useMutation({
    mutationFn: ({ id, includePhoto }: { id: string; includePhoto?: boolean }) =>
      kioskApi.print(id, includePhoto),
  });
}

export function useFinish() {
  return useMutation({
    mutationFn: (id: string) => kioskApi.finish(id),
  });
}
