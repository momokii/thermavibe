import { useCallback } from 'react';
import { useKioskStore } from '@/stores/kioskStore';
import { useCreateSession, useCapture, useFinish, usePrint, useSession } from './useSession';
import type { SessionResponse } from '@/api/types';

export function useKioskState() {
  const state = useKioskStore((s) => s.state);
  const sessionId = useKioskStore((s) => s.sessionId);
  const sessionData = useKioskStore((s) => s.sessionData);
  const error = useKioskStore((s) => s.error);
  const isTransitioning = useKioskStore((s) => s.isTransitioning);
  const store = useKioskStore();

  const createSessionMut = useCreateSession();
  const captureMut = useCapture();
  const printMut = usePrint();
  const finishMut = useFinish();

  const sessionQuery = useSession(
    state === 'processing' ? sessionId : null,
    { refetchInterval: 1000 },
  );

  if (
    state === 'processing' &&
    sessionQuery.data &&
    sessionQuery.data.state === 'reveal'
  ) {
    store.setSession(sessionId!, sessionQuery.data);
  }

  const startSession = useCallback(async () => {
    try {
      store.setTransitioning(true);
      const response = await createSessionMut.mutateAsync({ payment_enabled: false });
      store.setSession(response.data.id, response.data);
      store.setState('capture');
    } catch {
      store.setError('Failed to start session. Please try again.');
    } finally {
      store.setTransitioning(false);
    }
  }, [createSessionMut, store]);

  const triggerCapture = useCallback(async () => {
    if (!sessionId) return;
    try {
      store.setTransitioning(true);
      const response = await captureMut.mutateAsync(sessionId);
      store.setSession(sessionId, response.data as unknown as SessionResponse);
      store.setState('processing');
    } catch {
      store.setError('Capture failed. Please try again.');
    } finally {
      store.setTransitioning(false);
    }
  }, [captureMut, sessionId, store]);

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

  return {
    state,
    sessionId,
    sessionData,
    error,
    isTransitioning,
    startSession,
    triggerCapture,
    triggerPrint,
    finishSession,
    reset: store.reset,
  };
}
