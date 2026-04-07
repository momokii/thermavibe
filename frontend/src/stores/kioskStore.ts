import { create } from 'zustand';
import type { KioskState, SessionResponse } from '@/api/types';

interface KioskStore {
  state: KioskState;
  sessionId: string | null;
  sessionData: SessionResponse | null;
  error: string | null;
  isTransitioning: boolean;

  setState: (state: KioskState) => void;
  setSession: (id: string, data: SessionResponse) => void;
  setError: (error: string | null) => void;
  setTransitioning: (value: boolean) => void;
  reset: () => void;
}

const initialState = {
  state: 'idle' as KioskState,
  sessionId: null as string | null,
  sessionData: null as SessionResponse | null,
  error: null as string | null,
  isTransitioning: false,
};

export const useKioskStore = create<KioskStore>((set) => ({
  ...initialState,

  setState: (state) => set({ state }),
  setSession: (id, data) => set({ sessionId: id, sessionData: data, state: data.state }),
  setError: (error) => set({ error }),
  setTransitioning: (isTransitioning) => set({ isTransitioning }),
  reset: () => set(initialState),
}));
