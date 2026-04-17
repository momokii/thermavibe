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
  const timerPercent = Math.min(100, (timeRemainingSeconds / 60) * 100);

  return (
    <div className="w-full h-full flex flex-col"
      style={{
        background: 'radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.08) 0%, transparent 60%), #0f0a1a',
      }}
    >
      {/* Main content area */}
      <div className="flex-1 flex items-center justify-center p-6 relative">
        {/* Large preview of selected photo with glowing border */}
        <AnimatePresence mode="wait">
          {selectedPhoto && (
            <motion.div
              key={selectedPhotoIndex}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
              className="relative w-full max-w-lg aspect-[3/4] rounded-2xl overflow-hidden glow-border"
              style={{
                boxShadow: '0 0 25px rgba(139,92,246,0.35), 0 0 50px rgba(236,72,153,0.2), 0 0 4px rgba(255,255,255,0.1)',
                border: '2px solid rgba(139,92,246,0.4)',
              }}
            >
              <img
                src={selectedPhoto.photo_url}
                alt={`Photo ${selectedPhotoIndex + 1}`}
                className="w-full h-full object-cover"
              />

              {/* Photo number badge with gradient */}
              <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full text-white text-sm font-display font-bold"
                style={{
                  background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
                  boxShadow: '0 2px 8px rgba(139,92,246,0.4)',
                }}
              >
                {selectedPhotoIndex + 1}/{photos.length}
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

      {/* Thumbnail strip with glass background */}
      {photos.length > 1 && (
        <div className="px-4 pb-3">
          <div className="flex gap-3 justify-center overflow-x-auto py-2 glass-card rounded-2xl px-4">
            {photos.map((photo, i) => (
              <button
                key={i}
                onClick={() => selectPhoto(i)}
                className={`flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden transition-all duration-200 ${
                  i === selectedPhotoIndex
                    ? 'scale-110 ring-2 ring-kiosk-primary shadow-lg shadow-kiosk-primary/40'
                    : 'opacity-50 hover:opacity-80'
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
        {/* Timer ring */}
        <div className="flex justify-center mb-5">
          <div className="relative w-12 h-12">
            {/* Background ring */}
            <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
              <circle
                cx="24" cy="24" r="20" fill="none"
                stroke={isUrgent ? '#ef4444' : 'url(#timer-gradient)'}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 20}`}
                strokeDashoffset={`${2 * Math.PI * 20 * (1 - timerPercent / 100)}`}
                className="transition-all duration-1000"
              />
              <defs>
                <linearGradient id="timer-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
              </defs>
            </svg>
            {/* Time text in center */}
            <span className={`absolute inset-0 flex items-center justify-center text-xs font-mono font-bold ${
              isUrgent ? 'text-red-400' : 'text-kiosk-text/70'
            }`}>
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
            className="flex-1 py-4 rounded-2xl text-kiosk-text/80 text-lg font-display font-semibold
                       disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200
                       glass-card hover:bg-white/10 active:bg-white/15"
          >
            Retake
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={confirmSelection}
            disabled={isTransitioning || photos.length === 0}
            className="flex-[2] py-4 rounded-2xl text-white text-lg font-display font-bold
                       disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200
                       shadow-lg shadow-purple-500/25"
            style={{
              background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
            }}
          >
            {isTransitioning ? 'Analyzing...' : 'Analyze My Vibe'}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
