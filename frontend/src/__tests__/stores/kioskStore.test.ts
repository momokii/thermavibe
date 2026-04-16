import { describe, it, expect, beforeEach } from 'vitest';
import { useKioskStore } from '@/stores/kioskStore';
import type { SessionResponse } from '@/api/types';

describe('kioskStore', () => {
  beforeEach(() => {
    useKioskStore.getState().reset();
  });

  it('starts with idle state', () => {
    const { state, sessionId, sessionData, error, isTransitioning } =
      useKioskStore.getState();
    expect(state).toBe('idle');
    expect(sessionId).toBeNull();
    expect(sessionData).toBeNull();
    expect(error).toBeNull();
    expect(isTransitioning).toBe(false);
  });

  it('transitions state via setState', () => {
    useKioskStore.getState().setState('capture');
    expect(useKioskStore.getState().state).toBe('capture');

    useKioskStore.getState().setState('processing');
    expect(useKioskStore.getState().state).toBe('processing');
  });

  it('sets session and updates state from session data', () => {
    const mockSession: SessionResponse = {
      id: 'sess-123',
      state: 'capture',
      payment_enabled: false,
      payment_status: null,
      captured_at: null,
      capture_image_url: null,
      analysis_text: null,
      analysis_provider: null,
      printed_at: null,
      print_success: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: null,
      expires_at: null,
      photos: [],
      capture_time_limit: null,
    };

    useKioskStore.getState().setSession('sess-123', mockSession);
    const { sessionId, sessionData, state } = useKioskStore.getState();

    expect(sessionId).toBe('sess-123');
    expect(sessionData).toEqual(mockSession);
    expect(state).toBe('capture');
  });

  it('sets and clears errors', () => {
    useKioskStore.getState().setError('Camera not found');
    expect(useKioskStore.getState().error).toBe('Camera not found');

    useKioskStore.getState().setError(null);
    expect(useKioskStore.getState().error).toBeNull();
  });

  it('manages transitioning flag', () => {
    useKioskStore.getState().setTransitioning(true);
    expect(useKioskStore.getState().isTransitioning).toBe(true);

    useKioskStore.getState().setTransitioning(false);
    expect(useKioskStore.getState().isTransitioning).toBe(false);
  });

  it('resets all state to initial values', () => {
    useKioskStore.getState().setState('reveal');
    useKioskStore.getState().setError('test error');
    useKioskStore.getState().setTransitioning(true);

    useKioskStore.getState().reset();

    const { state, sessionId, sessionData, error, isTransitioning } =
      useKioskStore.getState();
    expect(state).toBe('idle');
    expect(sessionId).toBeNull();
    expect(sessionData).toBeNull();
    expect(error).toBeNull();
    expect(isTransitioning).toBe(false);
  });
});
