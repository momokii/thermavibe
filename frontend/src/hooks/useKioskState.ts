import { useCallback, useEffect } from 'react';
import { useKioskStore } from '@/stores/kioskStore';
import {
  useCreateSession,
  useSnap,
  useSelect,
  useRetake,
  useCapture,
  useFinish,
  usePrint,
  useSession,
} from './useSession';
import type { SessionResponse } from '@/api/types';

export function useKioskState() {
  const state = useKioskStore((s) => s.state);
  const sessionId = useKioskStore((s) => s.sessionId);
  const sessionData = useKioskStore((s) => s.sessionData);
  const error = useKioskStore((s) => s.error);
  const isTransitioning = useKioskStore((s) => s.isTransitioning);
  const photos = useKioskStore((s) => s.photos);
  const selectedPhotoIndex = useKioskStore((s) => s.selectedPhotoIndex);
  const timeLimitSeconds = useKioskStore((s) => s.timeLimitSeconds);
  const captureStartedAt = useKioskStore((s) => s.captureStartedAt);
  const store = useKioskStore();

  const createSessionMut = useCreateSession();
  const snapMut = useSnap();
  const selectMut = useSelect();
  const retakeMut = useRetake();
  const captureMut = useCapture();
  const finishMut = useFinish();
  const printMut = usePrint();

  const sessionQuery = useSession(
    state === 'processing' ? sessionId : null,
    { refetchInterval: 1000 },
  );

  // Transition from processing to reveal when backend signals ready
  useEffect(() => {
    if (
      state === 'processing' &&
      sessionQuery.data &&
      sessionQuery.data.state === 'reveal'
    ) {
      store.setSession(sessionId!, sessionQuery.data);
    }
  }, [state, sessionQuery.data, sessionId, store]);

  // --- Session lifecycle ---

  const startSession = useCallback(async () => {
    try {
      store.setTransitioning(true);
      // Reset all timer/capture state for fresh session
      store.setPhotos([]);
      store.selectPhoto(0);
      store.setCaptureStartedAt(null);
      const response = await createSessionMut.mutateAsync({ payment_enabled: false });
      store.setSession(response.data.id, response.data);
      if (response.data.capture_time_limit) {
        store.setTimeLimit(response.data.capture_time_limit);
      }
      // Route to payment screen if backend says payment is enabled, otherwise go straight to capture
      store.setState(response.data.payment_enabled ? 'payment' : 'capture');
    } catch {
      store.reset();
      store.setError('Failed to start session. Please try again.');
    } finally {
      store.setTransitioning(false);
    }
  }, [createSessionMut, store]);

  // --- Multi-photo capture ---

  const snapPhoto = useCallback(async () => {
    if (!sessionId) return;
    try {
      store.setTransitioning(true);
      const response = await snapMut.mutateAsync(sessionId);
      const data = response.data;
      store.setPhotos(data.photos);
      store.selectPhoto(data.photo_index);
      if (!captureStartedAt) {
        store.setCaptureStartedAt(Date.now());
      }
      store.setState('review');
    } catch {
      store.setState('idle');
      store.setError('Capture failed. Please try again.');
    } finally {
      store.setTransitioning(false);
    }
  }, [snapMut, sessionId, store, captureStartedAt]);

  const retake = useCallback(async () => {
    if (!sessionId) return;
    try {
      store.setTransitioning(true);
      await retakeMut.mutateAsync(sessionId);
      store.setState('capture');
    } catch {
      store.setError('Failed to go back. Please try again.');
    } finally {
      store.setTransitioning(false);
    }
  }, [retakeMut, sessionId, store]);

  const confirmSelection = useCallback(async () => {
    if (!sessionId) return;
    // Immediately show the processing screen while the API call runs in the background
    store.setState('processing');
    try {
      const response = await selectMut.mutateAsync({
        id: sessionId,
        photoIndex: selectedPhotoIndex,
      });
      store.setSession(sessionId, response.data as unknown as SessionResponse);
    } catch {
      store.reset();
      store.setError('Analysis failed. Please try again.');
    }
  }, [selectMut, sessionId, selectedPhotoIndex, store]);

  // --- Legacy single-shot capture (unused by new flow) ---

  const triggerCapture = useCallback(async () => {
    if (!sessionId) return;
    // Immediately show the processing screen while the API call runs in the background
    store.setState('processing');
    try {
      const response = await captureMut.mutateAsync(sessionId);
      store.setSession(sessionId, response.data as unknown as SessionResponse);
    } catch {
      store.setState('idle');
      store.setError('Capture failed. Please try again.');
    }
  }, [captureMut, sessionId, store]);

  // --- Print + Finish ---

  const triggerPrint = useCallback(async () => {
    if (!sessionId) return;
    try {
      await printMut.mutateAsync({ id: sessionId, includePhoto: true });
    } catch {
      // Print failure is non-blocking
    }
  }, [printMut, sessionId]);

  const finishSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      await finishMut.mutateAsync(sessionId);
    } catch {
      // Finish failure is non-blocking
    }
    store.reset();
  }, [finishMut, sessionId, store]);

  // --- Timer calculation ---

  const timeRemainingSeconds = captureStartedAt
    ? Math.max(0, timeLimitSeconds - (Date.now() - captureStartedAt) / 1000)
    : timeLimitSeconds;

  return {
    state,
    sessionId,
    sessionData,
    error,
    isTransitioning,
    photos,
    selectedPhotoIndex,
    timeLimitSeconds,
    timeRemainingSeconds,
    startSession,
    snapPhoto,
    retake,
    confirmSelection,
    triggerCapture,
    triggerPrint,
    finishSession,
    selectPhoto: store.selectPhoto,
    reset: store.reset,
  };
}
