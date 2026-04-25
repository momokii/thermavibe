import { create } from 'zustand';
import type { KioskState, SessionResponse, SessionType, PhotoEntry } from '@/api/types';

interface KioskStore {
  state: KioskState;
  sessionId: string | null;
  sessionData: SessionResponse | null;
  error: string | null;
  isTransitioning: boolean;

  // Multi-photo capture (shared)
  photos: PhotoEntry[];
  selectedPhotoIndex: number;
  timeLimitSeconds: number;
  captureStartedAt: number | null;

  // Session type
  sessionType: SessionType;

  // Feature flags (fetched on init)
  vibeCheckEnabled: boolean;
  photoboothEnabled: boolean;
  featuresLoaded: boolean;

  // Photobooth-specific state
  photoboothThemeId: number | null;
  photoboothLayoutRows: number;
  photoboothPhotoAssignments: Record<number, number>;
  photoboothCompositeUrl: string | null;

  // Actions
  setState: (state: KioskState) => void;
  setSession: (id: string, data: SessionResponse) => void;
  setError: (error: string | null) => void;
  setTransitioning: (value: boolean) => void;
  setPhotos: (photos: PhotoEntry[]) => void;
  selectPhoto: (index: number) => void;
  setTimeLimit: (seconds: number) => void;
  setCaptureStartedAt: (ts: number | null) => void;
  setSessionType: (type: SessionType) => void;
  setFeatures: (vibeCheck: boolean, photobooth: boolean) => void;
  setPhotoboothThemeId: (id: number | null) => void;
  setPhotoboothLayoutRows: (rows: number) => void;
  setPhotoboothPhotoAssignments: (assignments: Record<number, number>) => void;
  setPhotoboothCompositeUrl: (url: string | null) => void;
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
  timeLimitSeconds: 0,
  captureStartedAt: null as number | null,
  sessionType: 'vibe_check' as SessionType,
  vibeCheckEnabled: true,
  photoboothEnabled: true,
  featuresLoaded: false,
  photoboothThemeId: null as number | null,
  photoboothLayoutRows: 4,
  photoboothPhotoAssignments: {} as Record<number, number>,
  photoboothCompositeUrl: null as string | null,
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
  setSessionType: (type) => set({ sessionType: type }),
  setFeatures: (vibeCheck, photobooth) =>
    set({ vibeCheckEnabled: vibeCheck, photoboothEnabled: photobooth, featuresLoaded: true }),
  setPhotoboothThemeId: (id) => set({ photoboothThemeId: id }),
  setPhotoboothLayoutRows: (rows) => set({ photoboothLayoutRows: rows }),
  setPhotoboothPhotoAssignments: (assignments) => set({ photoboothPhotoAssignments: assignments }),
  setPhotoboothCompositeUrl: (url) => set({ photoboothCompositeUrl: url }),
  reset: () => set(initialState),
}));
