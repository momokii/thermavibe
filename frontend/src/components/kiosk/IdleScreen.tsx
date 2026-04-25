import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useKioskState } from '@/hooks/useKioskState';
import { useKioskStore } from '@/stores/kioskStore';
import { usePhotoboothState } from '@/hooks/usePhotoboothState';
import { FEATURE_SELECT_STATE } from '@/lib/constants';
import { photoboothApi } from '@/api/photoboothApi';

export default function IdleScreen() {
  const { startSession, isTransitioning, error } = useKioskState();
  const { startPhotoboothSession } = usePhotoboothState();
  const setError = useKioskStore((s) => s.setError);
  const featuresLoaded = useKioskStore((s) => s.featuresLoaded);

  // Fetch feature flags on first mount
  useEffect(() => {
    if (!featuresLoaded) {
      photoboothApi
        .getFeatures()
        .then((res: { data: { vibe_check_enabled: boolean; photobooth_enabled: boolean; photobooth_max_photos: number; photobooth_min_photos: number; photobooth_capture_time_limit_seconds: number; photobooth_default_layout_rows: number } }) => {
          useKioskStore.getState().setFeatures({
            vibeCheck: res.data.vibe_check_enabled,
            photobooth: res.data.photobooth_enabled,
            maxPhotos: res.data.photobooth_max_photos,
            minPhotos: res.data.photobooth_min_photos,
            captureTimeLimit: res.data.photobooth_capture_time_limit_seconds,
            defaultLayoutRows: res.data.photobooth_default_layout_rows,
          });
        })
        .catch(() => {
          useKioskStore.getState().setFeatures({
            vibeCheck: true, photobooth: true, maxPhotos: 8, minPhotos: 2, captureTimeLimit: 30, defaultLayoutRows: 4,
          });
        });
    }
  }, [featuresLoaded]);

  // Auto-clear error after 4 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [error, setError]);

  const handleTouch = () => {
    if (isTransitioning) return;

    const { vibeCheckEnabled, photoboothEnabled, setState } = useKioskStore.getState();

    if (vibeCheckEnabled && photoboothEnabled) {
      // Both features enabled → show selection screen
      setState(FEATURE_SELECT_STATE);
    } else if (photoboothEnabled && !vibeCheckEnabled) {
      // Only photobooth → start photobooth directly
      startPhotoboothSession();
    } else {
      // Only vibe check (or default) → start vibe check directly
      startSession();
    }
  };

  return (
    <div
      className="kiosk-layout items-center justify-center cursor-pointer relative overflow-hidden bg-surface-0"
      style={{
        background: 'radial-gradient(ellipse at 50% 40%, rgba(139,92,246,0.08) 0%, transparent 65%)',
      }}
      onClick={handleTouch}
      onTouchStart={handleTouch}
    >
      <AnimatePresence>
        {error && (
          <motion.div
            key="error-banner"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute left-1/2 -translate-x-1/2 px-6 py-3 bg-red-500/15 border border-red-500/30 text-red-300 rounded-xl text-sm max-w-md text-center z-10"
            style={{ top: 'var(--kiosk-safe-y)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Everything centered in one column */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="flex flex-col items-center gap-10 relative z-10"
      >
        {/* Brand */}
        <div className="text-center">
          <h1 className="text-6xl font-display font-black text-white mb-3 tracking-tight">
            VibePrint
          </h1>
          <p className="text-xl text-white/50 font-medium tracking-wide">
            AI-Powered Photobooth
          </p>
        </div>

        {/* CTA button — white text, no background */}
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="px-28 py-5 text-3xl font-display font-bold text-white bg-transparent rounded-2xl"
          disabled={isTransitioning}
        >
          {isTransitioning ? 'Starting...' : 'Touch to Start'}
        </motion.button>

        {/* Hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.35 }}
          transition={{ delay: 1.2 }}
          className="text-base text-white/35"
        >
          Tap anywhere to begin
        </motion.p>
      </motion.div>
    </div>
  );
}
