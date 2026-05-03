import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useKioskStore } from '@/stores/kioskStore';
import { usePhotoboothState } from '@/hooks/usePhotoboothState';
import { useCountdown } from '@/hooks/useCountdown';
import { CAMERA_STREAM_URL, COUNTDOWN_SECONDS } from '@/lib/constants';

export default function PhotoboothCaptureScreen() {
  const streamUrl = CAMERA_STREAM_URL;
  const photos = useKioskStore((s) => s.photos);
  const sessionId = useKioskStore((s) => s.sessionId);
  const captureTimeLimit = useKioskStore((s) => s.photoboothCaptureTimeLimit);
  const maxPhotos = useKioskStore((s) => s.photoboothMaxPhotos);
  const minPhotos = useKioskStore((s) => s.photoboothMinPhotos);
  const countdownEnabled = useKioskStore((s) => s.photoboothSnapCountdownEnabled);
  const { snapPhotoboothPhoto, finishCapture, isSnapping } = usePhotoboothState();
  const captureStartedAt = useKioskStore((s) => s.captureStartedAt);
  const setCaptureStartedAt = useKioskStore((s) => s.setCaptureStartedAt);
  const reset = useKioskStore((s) => s.reset);

  // 'none' = no timeout, 'short' = some photos but < minimum, 'empty' = no photos
  const [timeoutState, setTimeoutState] = useState<'none' | 'short' | 'empty'>('none');

  // Countdown state (only used when countdownEnabled)
  const { count, start: startCountdown, isRunning: isCountingDown } = useCountdown(COUNTDOWN_SECONDS);
  const [showCountdown, setShowCountdown] = useState(false);
  const timeoutsRef = useRef<number[]>([]);

  const timerSeconds = captureTimeLimit;
  const [timeLeft, setTimeLeft] = useState(timerSeconds);

  // Reset all local state when a new session starts (prevents stale state from previous session)
  const prevSessionRef = useRef<string | null>(null);
  useEffect(() => {
    if (sessionId && sessionId !== prevSessionRef.current) {
      setTimeoutState('none');
      setShowCountdown(false);
      setTimeLeft(timerSeconds);
      setCaptureStartedAt(null);
    }
    prevSessionRef.current = sessionId;
  }, [sessionId, timerSeconds, setCaptureStartedAt]);

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

      if (remaining <= 0) {
        clearInterval(interval);
        if (photos.length >= minPhotos) {
          finishCapture();
        } else if (photos.length > 0) {
          setTimeoutState('short');
        } else {
          setTimeoutState('empty');
        }
      }
    }, 100);
    return () => clearInterval(interval);
  }, [captureStartedAt, photos.length, finishCapture, timerSeconds, minPhotos]);

  // Auto-redirect back to feature select after timeout with no photos
  useEffect(() => {
    if (timeoutState !== 'empty') return;
    const timer = setTimeout(() => {
      reset();
    }, 4000);
    return () => clearTimeout(timer);
  }, [timeoutState, reset]);

  const handleExtendTimer = useCallback(() => {
    setTimeoutState('none');
    setCaptureStartedAt(Date.now());
    setTimeLeft(timerSeconds);
  }, [timerSeconds, setCaptureStartedAt]);

  const handleContinueAnyway = useCallback(() => {
    setTimeoutState('none');
    finishCapture();
  }, [finishCapture]);

  // Grace period for "short" timeout — auto-return if user doesn't act
  const [graceRemaining, setGraceRemaining] = useState(0);
  useEffect(() => {
    if (timeoutState !== 'short') return;
    const graceSeconds = timerSeconds;
    setGraceRemaining(graceSeconds);
    const interval = setInterval(() => {
      setGraceRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          reset();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timeoutState, timerSeconds, reset]);

  // When countdown hits 0 and countdown mode is active, snap the photo
  useEffect(() => {
    if (!showCountdown) return;
    if (count === 0) {
      setShowCountdown(false);
      snapPhotoboothPhoto();
    }
  }, [count, showCountdown, snapPhotoboothPhoto]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current = [];
    };
  }, []);

  const handleSnap = useCallback(() => {
    if (isSnapping || photos.length >= maxPhotos || timeLeft <= 0) return;

    if (countdownEnabled) {
      setShowCountdown(true);
      startCountdown(COUNTDOWN_SECONDS);
    } else {
      snapPhotoboothPhoto();
    }
  }, [isSnapping, photos.length, timeLeft, snapPhotoboothPhoto, maxPhotos, countdownEnabled, startCountdown]);

  const handleDone = useCallback(() => {
    if (photos.length >= minPhotos) finishCapture();
  }, [photos.length, minPhotos, finishCapture]);

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
      {/* Time's up overlay — no photos taken */}
      <AnimatePresence>
        {timeoutState === 'empty' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm gap-6"
          >
            <div className="text-6xl" role="img" aria-label="clock">⏰</div>
            <h2 className="text-3xl font-display font-black text-white">Time's Up!</h2>
            <p className="text-white/50 text-base">No photos were taken.</p>
            <p className="text-white/30 text-sm">Returning to menu...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Time's up overlay — some photos but not enough */}
      <AnimatePresence>
        {timeoutState === 'short' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm gap-6"
          >
            <div className="text-6xl" role="img" aria-label="clock">⏰</div>
            <h2 className="text-3xl font-display font-black text-white">Time's Up!</h2>
            <p className="text-white/60 text-lg font-medium">{photos.length}/{minPhotos} photos taken</p>
            <p className="text-white/30 text-sm">Returning to menu in {graceRemaining}s...</p>
            <div className="flex gap-4 mt-2">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleExtendTimer}
                className="py-4 px-16 rounded-2xl text-white text-2xl font-display font-bold transition-all duration-150 bg-pink-500 hover:bg-pink-600 active:bg-pink-700"
              >
                Extend Timer
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleContinueAnyway}
                className="py-4 px-16 rounded-2xl text-white/70 text-lg font-display font-bold transition-all duration-150 btn-secondary"
              >
                Continue with {photos.length}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera feed — top portion */}
      <div className="flex-[3] flex flex-col items-center justify-center relative" style={{ paddingTop: 'var(--kiosk-safe-y)' }}>
        {/* Status badges — above camera */}
        <div className="flex items-center justify-between w-full max-w-lg px-6 pb-4">
          <div className={`px-5 py-3 rounded-xl backdrop-blur-sm font-display font-bold text-base ${
            isUrgent ? 'bg-red-500/80 text-white' : 'bg-black/50 text-white/90'
          }`}>
            {Math.ceil(timeLeft)}s
          </div>
          <div className="px-5 py-3 rounded-xl bg-black/60 text-white font-display font-bold text-base backdrop-blur-sm">
            {photos.length}/{maxPhotos}
          </div>
        </div>

        {/* Camera feed */}
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

          {/* Countdown overlay */}
          <AnimatePresence>
            {showCountdown && isCountingDown && count > 0 && (
              <motion.div
                key={count}
                initial={{ opacity: 0, scale: 2.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
                className="absolute inset-0 flex items-center justify-center bg-black/30 z-10"
              >
                <span className="text-9xl font-display font-black text-white drop-shadow-2xl">
                  {count}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

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
            disabled={isSnapping || showCountdown || photos.length >= maxPhotos || timeLeft <= 0}
            className="w-2/8 h-12 py-5 rounded-2xl text-white text-2xl font-display font-bold disabled:opacity-30 transition-all duration-150 bg-pink-500 hover:bg-pink-600 active:bg-pink-700"
          >
            {showCountdown ? '...' : isSnapping ? 'Snapping...' : 'Snap!'}
          </motion.button>

          {photos.length >= minPhotos && (
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
