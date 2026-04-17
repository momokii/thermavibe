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
      className="w-full h-full flex flex-col items-center justify-center cursor-pointer relative overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at 20% 50%, rgba(139,92,246,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 50%, rgba(236,72,153,0.12) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(249,115,22,0.08) 0%, transparent 50%), #0f0a1a',
      }}
      onClick={handleTouch}
      onTouchStart={handleTouch}
    >
      {/* Decorative floating blobs */}
      <div className="blob blob-violet w-72 h-72 -top-20 -left-20 animate-float" />
      <div className="blob blob-pink w-96 h-96 -bottom-32 -right-32 animate-float-slow" />
      <div className="blob blob-orange w-48 h-48 top-1/3 right-10 animate-float-fast" />

      {/* Main content */}
      <motion.div
        initial={{ opacity: 0, y: -30, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
        className="text-center mb-12 relative z-10"
      >
        <h1 className="text-7xl font-display font-black text-gradient-vibe mb-3 tracking-tight">
          VibePrint
        </h1>
        <p className="text-lg text-kiosk-text-muted/70 font-medium tracking-wide">
          AI-Powered Photobooth
        </p>
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div
            key="error-banner"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4 px-6 py-3 bg-red-500/20 border border-red-500/50 text-red-300 rounded-xl text-sm max-w-md text-center relative z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* CTA Button */}
      <motion.button
        className="btn-gradient px-14 py-5 text-xl font-display font-bold rounded-3xl shadow-lg shadow-purple-500/25 relative z-10"
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        disabled={isTransitioning}
      >
        <span className="relative z-10">
          {isTransitioning ? 'Starting...' : 'Touch to Start'}
        </span>
      </motion.button>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 text-sm text-kiosk-text/40 relative z-10"
      >
        Tap anywhere to begin your vibe reading
      </motion.p>
    </div>
  );
}
