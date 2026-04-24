import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useKioskStore } from '@/stores/kioskStore';
import { usePhotoboothState } from '@/hooks/usePhotoboothState';
import { CAMERA_STREAM_URL } from '@/lib/constants';

// Defaults — these will be overridden by backend config when available
const DEFAULT_TIMER_SECONDS = 30;
const DEFAULT_MAX_PHOTOS = 8;

export default function PhotoboothCaptureScreen() {
  const streamUrl = CAMERA_STREAM_URL;
  const photos = useKioskStore((s) => s.photos);
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

  return (
    <div className="kiosk-layout items-center justify-center gap-4 relative bg-surface-0">
      {/* Timer */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-6 left-1/2 -translate-x-1/2 z-20"
      >
        <div
          className={`px-6 py-3 rounded-2xl font-display font-bold text-2xl ${
            isUrgent
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'bg-white/10 text-white/80 border border-white/10'
          }`}
        >
          {Math.ceil(timeLeft)}s
        </div>
      </motion.div>

      {/* Camera feed */}
      <div className="relative w-full max-w-lg aspect-square rounded-2xl overflow-hidden border border-white/10">
        {streamUrl && (
          <img
            src={streamUrl}
            alt="Camera feed"
            className="w-full h-full object-cover"
          />
        )}

        {/* Photo count */}
        <div className="absolute top-3 right-3 px-4 py-2 rounded-xl bg-black/60 text-white font-display font-bold text-sm">
          {photos.length}/{maxPhotos}
        </div>

        {/* Flash effect on snap */}
        {isSnapping && (
          <motion.div
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-white z-10"
          />
        )}
      </div>

      {/* Thumbnail strip */}
      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto max-w-lg px-2 py-2">
          {photos.map((_, i) => (
            <div
              key={i}
              className="w-12 h-12 rounded-lg bg-white/10 border border-white/20 flex-shrink-0"
            />
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-4 mt-2">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleSnap}
          disabled={isSnapping || photos.length >= maxPhotos || timeLeft <= 0}
          className="px-10 py-4 rounded-2xl bg-pink-500 text-white font-display font-bold text-xl disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSnapping ? 'Snapping...' : 'Snap!'}
        </motion.button>

        {photos.length >= 2 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDone}
            className="px-10 py-4 rounded-2xl bg-white/10 text-white font-display font-bold text-xl border border-white/20"
          >
            Done ({photos.length})
          </motion.button>
        )}
      </div>
    </div>
  );
}
