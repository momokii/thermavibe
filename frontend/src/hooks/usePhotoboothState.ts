/**
 * Photobooth orchestration hook.
 *
 * Manages the photobooth flow:
 *   CAPTURE → FRAME_SELECT → ARRANGE → COMPOSITING → PHOTOBOOTH_REVEAL
 */

import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useKioskStore } from '@/stores/kioskStore';
import { photoboothApi } from '@/api/photoboothApi';
import { kioskApi } from '@/api/kioskApi';
import type { FrameSelectRequest, ArrangeRequest, SessionCreateRequest, SessionResponse, PhotoboothSnapResponse, ShareResponse } from '@/api/types';

export function usePhotoboothState() {
  const state = useKioskStore((s) => s.state);
  const sessionId = useKioskStore((s) => s.sessionId);
  const photos = useKioskStore((s) => s.photos);
  const photoboothThemeId = useKioskStore((s) => s.photoboothThemeId);
  const photoboothLayoutRows = useKioskStore((s) => s.photoboothLayoutRows);
  const photoboothPhotoAssignments = useKioskStore((s) => s.photoboothPhotoAssignments);
  const photoboothCompositeUrl = useKioskStore((s) => s.photoboothCompositeUrl);
  const isTransitioning = useKioskStore((s) => s.isTransitioning);

  const { setSession, setState, setTransitioning, setError, setPhotos, reset } =
    useKioskStore.getState();

  const snapMutation = useMutation({
    mutationFn: (id: string) => photoboothApi.snap(id),
    onMutate: () => setTransitioning(true),
    onSuccess: (response: { data: PhotoboothSnapResponse }) => {
      const data = response.data;
      setPhotos(
        Array.from({ length: data.total_photos }, (_, i) => ({
          photo_url: `/api/v1/kiosk/session/${sessionId}/photo/${i}`,
          captured_at: new Date().toISOString(),
        })),
      );
      setTransitioning(false);
    },
    onError: (err: Error) => {
      setError(err.message);
      setTransitioning(false);
    },
  });

  const doneMutation = useMutation({
    mutationFn: (id: string) => photoboothApi.doneCapture(id),
    onMutate: () => setTransitioning(true),
    onSuccess: (response: { data: SessionResponse }) => {
      const data = response.data;
      if (sessionId) setSession(sessionId, data);
      setTransitioning(false);
    },
    onError: (err: Error) => {
      setError(err.message);
      setTransitioning(false);
    },
  });

  const frameMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: FrameSelectRequest }) =>
      photoboothApi.selectFrame(id, data),
    onMutate: () => setTransitioning(true),
    onSuccess: (response: { data: SessionResponse }) => {
      const data = response.data;
      if (sessionId) setSession(sessionId, data);
      setTransitioning(false);
    },
    onError: (err: Error) => {
      setError(err.message);
      setTransitioning(false);
    },
  });

  const arrangeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ArrangeRequest }) =>
      photoboothApi.arrange(id, data),
    onMutate: () => setTransitioning(true),
    onSuccess: (response: { data: SessionResponse }) => {
      const data = response.data;
      if (sessionId) setSession(sessionId, data);
      const { setPhotoboothCompositeUrl } = useKioskStore.getState();
      if (sessionId) {
        setPhotoboothCompositeUrl(photoboothApi.getCompositeUrl(sessionId));
      }
      setTransitioning(false);
    },
    onError: (err: Error) => {
      setError(err.message);
      setTransitioning(false);
    },
  });

  const printMutation = useMutation({
    mutationFn: (id: string) => photoboothApi.print(id),
  });

  const shareMutation = useMutation({
    mutationFn: (id: string) => photoboothApi.share(id),
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const retakeMutation = useMutation({
    mutationFn: (id: string) => photoboothApi.retake(id),
    onMutate: () => setTransitioning(true),
    onSuccess: (response: { data: SessionResponse }) => {
      const data = response.data;
      if (sessionId) setSession(sessionId, data);
      setPhotos([]);
      setTransitioning(false);
    },
    onError: (err: Error) => {
      setError(err.message);
      setTransitioning(false);
    },
  });

  const finishMutation = useMutation({
    mutationFn: (id: string) => kioskApi.finish(id),
    onSuccess: () => {
      reset();
    },
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startPhotoboothSession = useCallback(async () => {
    setTransitioning(true);
    try {
      const response = await kioskApi.createSession({
        payment_enabled: false,
        session_type: 'photobooth',
      } satisfies SessionCreateRequest);
      const data = response.data;
      setSession(data.id, data);
      if (data.capture_time_limit) {
        useKioskStore.getState().setTimeLimit(data.capture_time_limit);
      }
      useKioskStore.getState().setSessionType('photobooth');
      setState('capture');
      setTransitioning(false);
    } catch (err) {
      setError((err as Error).message);
      setTransitioning(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snapPhotoboothPhoto = useCallback(() => {
    if (sessionId) snapMutation.mutate(sessionId);
  }, [sessionId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const finishCapture = useCallback(() => {
    if (sessionId) doneMutation.mutate(sessionId);
  }, [sessionId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const selectFrame = useCallback(
    (themeId: number, layoutRows: number) => {
      if (sessionId) {
        useKioskStore.getState().setPhotoboothThemeId(themeId);
        useKioskStore.getState().setPhotoboothLayoutRows(layoutRows);
        frameMutation.mutate({
          id: sessionId,
          data: { theme_id: themeId, layout_rows: layoutRows },
        });
      }
    },
    [sessionId],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const arrangePhotos = useCallback(
    (assignments: Record<number, number>) => {
      if (sessionId) {
        useKioskStore.getState().setPhotoboothPhotoAssignments(assignments);
        arrangeMutation.mutate({ id: sessionId, data: { photo_assignments: assignments } });
      }
    },
    [sessionId],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const printStrip = useCallback(() => {
    if (sessionId) printMutation.mutate(sessionId);
  }, [sessionId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const getShareUrl = useCallback(() => {
    if (sessionId) shareMutation.mutate(sessionId);
  }, [sessionId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const retakePhotobooth = useCallback(() => {
    if (sessionId) retakeMutation.mutate(sessionId);
  }, [sessionId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const finishPhotobooth = useCallback(() => {
    if (sessionId) finishMutation.mutate(sessionId);
  }, [sessionId]);

  return {
    // State
    state,
    sessionId,
    photos,
    isTransitioning,
    photoboothThemeId,
    photoboothLayoutRows,
    photoboothPhotoAssignments,
    photoboothCompositeUrl,

    // Actions
    startPhotoboothSession,
    snapPhotoboothPhoto,
    finishCapture,
    selectFrame,
    arrangePhotos,
    printStrip,
    getShareUrl,
    retakePhotobooth,
    finishPhotobooth,

    // Mutation states
    isSnapping: snapMutation.isPending,
    isArranging: arrangeMutation.isPending,
    arrangeError: arrangeMutation.error?.message ?? null,
    isPrinting: printMutation.isPending,
    isSharing: shareMutation.isPending,
    shareError: shareMutation.error?.message ?? null,
    shareData: (shareMutation.data as { data: ShareResponse } | undefined)?.data ?? null,
  };
}
