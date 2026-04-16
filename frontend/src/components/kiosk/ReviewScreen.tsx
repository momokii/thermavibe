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

  // Format remaining time as MM:SS
  const mins = Math.floor(Math.max(0, timeRemainingSeconds) / 60);
  const secs = Math.floor(Math.max(0, timeRemainingSeconds) % 60);
  const timeDisplay = `${mins}:${secs.toString().padStart(2, '0')}`;
  const isUrgent = timeRemainingSeconds < 10;

  const selectedPhoto = photos[selectedPhotoIndex];

  return (
    <div className="w-full h-full flex flex-col bg-kiosk-background">
      {/* Main content area */}
      <div className="flex-1 flex items-center justify-center p-6 relative">
        {/* Large preview of selected photo */}
        <AnimatePresence mode="wait">
          {selectedPhoto && (
            <motion.div
              key={selectedPhotoIndex}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="relative w-full max-w-lg aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl"
            >
              <img
                src={selectedPhoto.photo_url}
                alt={`Photo ${selectedPhotoIndex + 1}`}
                className="w-full h-full object-cover"
              />

              {/* Photo number badge */}
              <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full">
                <span className="text-white text-sm font-medium">
                  {selectedPhotoIndex + 1}/{photos.length}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error overlay */}
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-6 py-3 bg-red-500/20 border border-red-500/50 text-red-300 rounded-xl text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      {photos.length > 1 && (
        <div className="px-4 pb-3">
          <div className="flex gap-3 justify-center overflow-x-auto py-2">
            {photos.map((photo, i) => (
              <button
                key={i}
                onClick={() => selectPhoto(i)}
                className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                  i === selectedPhotoIndex
                    ? 'border-kiosk-primary scale-110 shadow-lg shadow-kiosk-primary/30'
                    : 'border-white/20 opacity-60 hover:opacity-90'
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
        </div>
      )}

      {/* Bottom bar: timer + actions */}
      <div className="px-6 pb-8 pt-3">
        {/* Timer */}
        <div className="flex justify-center mb-4">
          <div
            className={`px-4 py-2 rounded-full backdrop-blur-sm flex items-center gap-2 ${
              isUrgent
                ? 'bg-red-500/20 border border-red-500/50'
                : 'bg-white/10 border border-white/20'
            }`}
          >
            <svg
              className={`w-4 h-4 ${isUrgent ? 'text-red-400 animate-pulse' : 'text-white/60'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span
              className={`text-lg font-mono font-bold ${
                isUrgent ? 'text-red-300' : 'text-white/80'
              }`}
            >
              {timeDisplay}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-4">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={retake}
            disabled={isTransitioning}
            className="flex-1 py-4 rounded-2xl border-2 border-white/30 text-white/80 text-lg font-semibold
                       disabled:opacity-40 disabled:cursor-not-allowed
                       hover:bg-white/10 active:bg-white/20 transition-colors"
          >
            Retake
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={confirmSelection}
            disabled={isTransitioning || photos.length === 0}
            className="flex-[2] py-4 rounded-2xl bg-kiosk-primary text-white text-lg font-semibold
                       disabled:opacity-40 disabled:cursor-not-allowed
                       hover:bg-kiosk-primary/90 active:bg-kiosk-primary/80 transition-colors
                       shadow-lg shadow-kiosk-primary/25"
          >
            {isTransitioning ? 'Analyzing...' : 'Analyze My Vibe'}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
