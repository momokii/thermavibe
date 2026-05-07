import { useMutation, useQuery } from '@tanstack/react-query';
import { kioskApi } from '@/api/kioskApi';
import type { SelectRequest } from '@/api/types';

export function useCreateSession() {
  return useMutation({
    mutationFn: (data: { payment_enabled: boolean; access_code_mode?: boolean }) =>
      kioskApi.createSession(data),
  });
}

export function useSnap() {
  return useMutation({
    mutationFn: (id: string) => kioskApi.snap(id),
  });
}

export function useSelect() {
  return useMutation({
    mutationFn: ({ id, photoIndex, timeoutMs }: { id: string; photoIndex: number; timeoutMs?: number }) =>
      kioskApi.select(id, { photo_index: photoIndex } satisfies SelectRequest, timeoutMs),
  });
}

export function useRetake() {
  return useMutation({
    mutationFn: (id: string) => kioskApi.retake(id),
  });
}

export function useCapture() {
  return useMutation({
    mutationFn: ({ id, timeoutMs }: { id: string; timeoutMs?: number }) =>
      kioskApi.capture(id, timeoutMs),
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
    retry: false,
  });
}

export function useFinish() {
  return useMutation({
    mutationFn: (id: string) => kioskApi.finish(id),
  });
}
