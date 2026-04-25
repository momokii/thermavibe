import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useKioskStore } from '@/stores/kioskStore';
import { usePhotoboothState } from '@/hooks/usePhotoboothState';
import { CAMERA_STREAM_URL } from '@/lib/constants';

const DEFAULT_TIMER_SECONDS = 30;
const DEFAULT_MAX_PHOTOS = 8;

export default function PhotoboothCaptureScreen() {
  const streamUrl = CAMERA_STREAM_URL;
  const photos = useKioskStore((s) => s.photos);
  const sessionId = useKioskStore((s) => s.sessionId);
  const timeLimitSeconds = useKioskStore((s) => s.timeLimitSeconds);
  const { snapPhotoboothPhoto, finishCapture, isSnapping } = usePhotoboothState();
  const captureStartedAt = useKioskStore((s) => s.captureStartedAt);
  const setCaptureStartedAt = useKioskStore((s) => s.setCaptureStartedAt);

  const timerSeconds = timeLimitSeconds || DEFAULT_TIMER_SECONDS;
  const maxPhotos = DEFAULT_MAX_PHOTOS;
  const [timeLeft, setTimeLeft] = useState(timerSeconds);

  // Start timer on mount
  useEffect(() => {
    if (!captureStartedAt) {
      setCaptureStartedAt(Date.now());
    }
  }, [captureStartedAt, setCaptureStartedAt]);

  // Countdown timer
  useEffect(() => {
    const startTs = captureStartedAt ?? Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTs) / 1000;
      const remaining = Math.max(0, timerSeconds - elapsed);
      setTimeLeft(remaining);

      if (remaining <= 0 && photos.length > 0) {
        clearInterval(interval);
        finishCapture();
      }
    }, 100);
    return () => clearInterval(interval);
  }, [captureStartedAt, photos.length, finishCapture, timerSeconds]);

  const handleSnap = useCallback(() => {
    if (isSnapping || photos.length >= maxPhotos || timeLeft <= 0) return;
    snapPhotoboothPhoto();
  }, [isSnapping, photos.length, timeLeft, snapPhotoboothPhoto]);

  const handleDone = useCallback(() => {
    if (photos.length >= 2) finishCapture();
  }, [photos.length, finishCapture]);

  const isUrgent = timeLeft <= 10;

  // Build photo URL from photo entry
  const getPhotoUrl = (photoIdx: number) => {
    const entry = photos[photoIdx];
    if (entry?.photo_url) return entry.photo_url;
    if (sessionId) return `/api/v1/kiosk/session/${sessionId}/photo/${photoIdx}`;
    return null;
  };

  return (
    <div className="kiosk-layout bg-surface-0 relative overflow-hidden">
      {/* Camera feed — top portion */}
      <div className="flex-[3] flex items-center justify-center relative" style={{ paddingTop: 'var(--kiosk-safe-y)' }}>
        <div
          className="relative w-full max-w-lg aspect-square rounded-2xl overflow-hidden"
          style={{ border: '2px solid rgba(255,255,255,0.12)' }}
        >
          {streamUrl && (
            <img
              src={streamUrl}
              alt="Camera feed"
              className="w-full h-full object-cover"
            />
          )}

          {/* Photo count badge */}
          <div className="absolute top-4 right-4 px-4 py-2 rounded-xl bg-black/60 text-white font-display font-bold text-sm backdrop-blur-sm">
            {photos.length}/{maxPhotos}
          </div>

          {/* Timer badge */}
          <div className={`absolute top-4 left-4 px-4 py-2 rounded-xl backdrop-blur-sm font-display font-bold text-sm ${
            isUrgent ? 'bg-red-500/80 text-white' : 'bg-black/50 text-white/80'
          }`}>
            {Math.ceil(timeLeft)}s
          </div>

          {/* Flash effect */}
          <AnimatePresence>
            {isSnapping && (
              <motion.div
                initial={{ opacity: 0.8 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 bg-white z-10"
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="flex-[2] flex flex-col items-center justify-center gap-6 pb-10" style={{ paddingTop: '3rem' }}>
        {/* Thumbnail strip of captured photos */}
        {photos.length > 0 && (
          <div className="flex gap-3 justify-center px-4 py-2">
            {photos.map((_, i) => {
              const url = getPhotoUrl(i);
              return (
                <div
                  key={i}
                  className="w-16 h-16 rounded-lg overflow-hidden border border-white/20 flex-shrink-0"
                >
                  {url ? (
                    <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-white/10 flex items-center justify-center text-white/40 text-xs">
                      {i + 1}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col items-center gap-4 w-full px-8">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSnap}
            disabled={isSnapping || photos.length >= maxPhotos || timeLeft <= 0}
            className="w-2/8 h-12 py-5 rounded-2xl text-white text-2xl font-display font-bold disabled:opacity-30 transition-all duration-150 bg-pink-500 hover:bg-pink-600 active:bg-pink-700"
          >
            {isSnapping ? 'Snapping...' : 'Snap!'}
          </motion.button>

          {photos.length >= 2 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleDone}
              className="w-2/8 h-12 rounded-2xl text-white/70 text-lg font-display font-semibold transition-all duration-150 btn-secondary"
            >
              Done ({photos.length})
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}
