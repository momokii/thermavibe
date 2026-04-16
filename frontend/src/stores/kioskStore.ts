import { create } from 'zustand';
import type { KioskState, SessionResponse, PhotoEntry } from '@/api/types';

interface KioskStore {
  state: KioskState;
  sessionId: string | null;
  sessionData: SessionResponse | null;
  error: string | null;
  isTransitioning: boolean;

  // Multi-photo capture
  photos: PhotoEntry[];
  selectedPhotoIndex: number;
  timeLimitSeconds: number;
  captureStartedAt: number | null;

  setState: (state: KioskState) => void;
  setSession: (id: string, data: SessionResponse) => void;
  setError: (error: string | null) => void;
  setTransitioning: (value: boolean) => void;
  setPhotos: (photos: PhotoEntry[]) => void;
  selectPhoto: (index: number) => void;
  setTimeLimit: (seconds: number) => void;
  setCaptureStartedAt: (ts: number | null) => void;
  reset: () => void;
}

const initialState = {
  state: 'idle' as KioskState,
  sessionId: null as string | null,
  sessionData: null as SessionResponse | null,
  error: null as string | null,
  isTransitioning: false,
  photos: [] as PhotoEntry[],
  selectedPhotoIndex: 0,
  timeLimitSeconds: 60,
  captureStartedAt: null as number | null,
};

export const useKioskStore = create<KioskStore>((set) => ({
  ...initialState,

  setState: (state) => set({ state }),
  setSession: (id, data) => set({ sessionId: id, sessionData: data, state: data.state }),
  setError: (error) => set({ error }),
  setTransitioning: (isTransitioning) => set({ isTransitioning }),
  setPhotos: (photos) => set({ photos }),
  selectPhoto: (index) => set({ selectedPhotoIndex: index }),
  setTimeLimit: (seconds) => set({ timeLimitSeconds: seconds }),
  setCaptureStartedAt: (ts) => set({ captureStartedAt: ts }),
  reset: () => set(initialState),
}));
