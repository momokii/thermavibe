import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useKioskState } from '@/hooks/useKioskState';

export default function ReviewScreen() {
  const {
    sessionId,
    photos,
    selectedPhotoIndex,
    timeRemainingSeconds,
    isTransitioning,
    selectPhoto,
    retake,
    confirmSelection,
    error,
  } = useKioskState();

  const [, setTick] = useState(0);
  const hasFiredRef = useRef(false);

  // Force re-render every second for the countdown timer
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-confirm when timer expires
  const onExpire = useCallback(() => {
    if (sessionId && !isTransitioning) {
      confirmSelection();
    }
  }, [sessionId, isTransitioning, confirmSelection]);

  useEffect(() => {
    if (timeRemainingSeconds <= 0 && photos.length > 0 && !hasFiredRef.current) {
      hasFiredRef.current = true;
      onExpire();
    }
  }, [timeRemainingSeconds, photos.length, onExpire]);

  const mins = Math.floor(Math.max(0, timeRemainingSeconds) / 60);
  const secs = Math.floor(Math.max(0, timeRemainingSeconds) % 60);
  const timeDisplay = `${mins}:${secs.toString().padStart(2, '0')}`;
  const isUrgent = timeRemainingSeconds < 10;

  const selectedPhoto = photos[selectedPhotoIndex];

  return (
    <div className="kiosk-layout bg-surface-0">
      {/* Photo area — positioned lower for better balance */}
      <div className="flex-[2] flex items-center justify-center" style={{ paddingTop: '5rem', paddingBottom: '1rem' }}>
        <AnimatePresence mode="wait">
          {selectedPhoto && (
            <motion.div
              key={selectedPhotoIndex}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
              className="relative w-auto max-w-md aspect-square rounded-xl overflow-hidden"
              style={{ border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <img
                src={selectedPhoto.photo_url}
                alt={`Photo ${selectedPhotoIndex + 1}`}
                className="w-full h-full object-cover"
              />

              {/* Photo number badge */}
              <div className="absolute top-3 left-3 px-3 py-1.5 rounded-lg text-white text-sm font-display font-bold bg-violet-600/90 backdrop-blur-sm">
                {selectedPhotoIndex + 1}/{photos.length}
              </div>

              {/* Countdown timer */}
              <div className={`absolute top-3 right-3 px-3 py-1.5 rounded-lg backdrop-blur-sm font-mono font-bold text-lg tabular-nums ${
                isUrgent ? 'bg-red-500/80 text-white' : 'bg-black/50 text-white/80'
              }`}>
                {timeDisplay}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error overlay */}
        {error && (
          <div className="absolute left-1/2 -translate-x-1/2 px-6 py-3 bg-red-500/15 border border-red-500/30 text-red-300 rounded-xl text-sm z-10"
            style={{ top: 'var(--kiosk-safe-y)' }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Bottom controls — thumbnails + action buttons */}
      <div className="flex-[2] flex flex-col justify-center gap-6">
        {/* Thumbnail strip */}
        {photos.length > 1 && (
          <div className="flex gap-4 justify-center py-3 px-4 rounded-xl" style={{ background: 'var(--surface-1)' }}>
            {photos.map((photo, i) => (
              <button
                key={i}
                onClick={() => selectPhoto(i)}
                className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden transition-all duration-200 ${
                  i === selectedPhotoIndex
                    ? 'ring-2 ring-violet-500 ring-offset-2 ring-offset-surface-0'
                    : 'opacity-40 hover:opacity-70'
                }`}
              >
                <img
                  src={photo.photo_url}
                  alt={`Thumbnail ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        {/* Action buttons — kiosk-sized touch targets */}
        <div className="flex gap-6">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={retake}
            disabled={isTransitioning}
            className="flex-1 py-4 rounded-xl text-white/70 text-lg font-display font-semibold
                       disabled:opacity-30 transition-all duration-150 btn-secondary"
          >
            Retake
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={confirmSelection}
            disabled={isTransitioning || photos.length === 0}
            className="flex-[2] py-4 rounded-xl text-white text-lg font-display font-bold
                       disabled:opacity-30 transition-all duration-150 btn-primary"
          >
            {isTransitioning ? 'Analyzing...' : 'Analyze My Vibe'}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
