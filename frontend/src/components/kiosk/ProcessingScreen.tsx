import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PROCESSING_MESSAGES, PROCESSING_MESSAGE_INTERVAL_MS } from '@/lib/constants';
import { useKioskStore } from '@/stores/kioskStore';

export default function ProcessingScreen() {
  const error = useKioskStore((s) => s.error);
  const photos = useKioskStore((s) => s.photos);
  const selectedPhotoIndex = useKioskStore((s) => s.selectedPhotoIndex);
  const [messageIndex, setMessageIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const selectedPhoto = photos[selectedPhotoIndex];

  useEffect(() => {
    const timer = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % PROCESSING_MESSAGES.length);
    }, PROCESSING_MESSAGE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="kiosk-layout items-center justify-center relative overflow-hidden bg-surface-0">
      <AnimatePresence>
        {error && (
          <motion.div
            key="error-banner"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute left-1/2 -translate-x-1/2 px-6 py-3 bg-red-500/15 border border-red-500/30 text-red-300 rounded-xl text-sm max-w-md text-center z-10"
            style={{ top: 'var(--kiosk-safe-y)' }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selected photo with glow effect */}
      {selectedPhoto && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
          className="relative mb-8"
        >
          {/* Animated glow ring around photo */}
          <div className="absolute -inset-3 rounded-2xl vibe-glow-ring" />
          <div className="relative w-48 h-48 rounded-xl overflow-hidden"
            style={{ border: '2px solid rgba(139,92,246,0.4)' }}
          >
            <img
              src={selectedPhoto.photo_url}
              alt="Your photo"
              className="w-full h-full object-cover"
            />
            {/* Subtle shimmer overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-transparent to-fuchsia-500/10 animate-pulse" />
          </div>
        </motion.div>
      )}

      {/* Animated rings */}
      <div className="relative w-24 h-24 flex items-center justify-center mb-6">
        <div className="absolute inset-0 rounded-full ring-pulse"
          style={{ border: '2px solid rgba(139,92,246,0.3)', animationDelay: '0s' }}
        />
        <div className="absolute inset-0 rounded-full ring-pulse"
          style={{ border: '2px solid rgba(139,92,246,0.15)', animationDelay: '0.8s' }}
        />
        <div className="absolute inset-0 rounded-full ring-pulse"
          style={{ border: '2px solid rgba(139,92,246,0.08)', animationDelay: '1.6s' }}
        />
        {/* Center crystal ball */}
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 animate-pulse" />
      </div>

      {/* Rotating message */}
      <div className="h-12 flex items-center justify-center mb-3 relative z-10">
        <AnimatePresence mode="wait">
          <motion.p
            key={messageIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="text-2xl font-display font-bold text-white/80 text-center px-6"
          >
            {PROCESSING_MESSAGES[messageIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Elapsed time indicator */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="text-sm text-white/25 relative z-10"
      >
        {elapsed < 60
          ? `Analyzing for ${elapsed}s...`
          : `Almost ready... ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
        }
      </motion.p>
    </div>
  );
}
