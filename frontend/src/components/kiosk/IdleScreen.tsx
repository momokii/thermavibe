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
      className="w-full h-full flex flex-col items-center justify-center cursor-pointer relative overflow-hidden bg-surface-0"
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
            className="absolute top-6 left-1/2 -translate-x-1/2 px-6 py-3 bg-red-500/15 border border-red-500/30 text-red-300 rounded-xl text-sm max-w-md text-center z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Brand — pushed up */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="text-center relative z-10 mt-auto"
      >
        <h1 className="text-7xl font-display font-black text-white mb-5 tracking-tight">
          VibePrint
        </h1>
        <p className="text-xl text-white/50 font-medium tracking-wide">
          AI-Powered Photobooth
        </p>
      </motion.div>

      {/* Large CTA button with generous spacing */}
      <div className="relative z-10 my-auto py-8">
        {/* Wide pulse ring behind button */}
        <div className="absolute inset-0 rounded-3xl animate-pulse-ring bg-white/8"
          style={{ margin: '-16px', padding: '16px' }}
        />

        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="btn-kiosk-cta relative px-20 py-6 text-2xl font-display font-bold rounded-2xl"
          disabled={isTransitioning}
        >
          {isTransitioning ? 'Starting...' : 'Touch to Start'}
        </motion.button>
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.35 }}
        transition={{ delay: 1.2 }}
        className="absolute bottom-12 text-base text-white/35 z-10"
      >
        Tap anywhere to begin
      </motion.p>
    </div>
  );
}
