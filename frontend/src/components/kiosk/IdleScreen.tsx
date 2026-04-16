import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useKioskState } from '@/hooks/useKioskState';
import { useKioskStore } from '@/stores/kioskStore';

export default function IdleScreen() {
  const { startSession, isTransitioning, error } = useKioskState();
  const setError = useKioskStore((s) => s.setError);

  // Auto-clear error after 4 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [error, setError]);

  const handleTouch = () => {
    if (!isTransitioning) startSession();
  };

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center bg-kiosk-background cursor-pointer"
      onClick={handleTouch}
      onTouchStart={handleTouch}
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-12"
      >
        <h1 className="text-5xl font-bold text-kiosk-text mb-2">VibePrint</h1>
        <p className="text-lg text-kiosk-text/60">AI-Powered Photobooth</p>
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div
            key="error-banner"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4 px-6 py-3 bg-red-500/20 border border-red-500/50 text-red-300 rounded-xl text-sm max-w-md text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        className="px-12 py-4 bg-kiosk-primary text-white text-xl font-semibold rounded-2xl shadow-lg"
        animate={{ scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        disabled={isTransitioning}
      >
        {isTransitioning ? 'Starting...' : 'Touch to Start'}
      </motion.button>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ delay: 1 }}
        className="absolute bottom-8 text-sm text-kiosk-text/40"
      >
        Tap anywhere to begin your vibe reading
      </motion.p>
    </div>
  );
}
