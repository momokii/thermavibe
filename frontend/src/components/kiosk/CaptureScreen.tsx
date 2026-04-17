import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useKioskState } from '@/hooks/useKioskState';
import { useCamera } from '@/hooks/useCamera';
import { useCountdown } from '@/hooks/useCountdown';
import { COUNTDOWN_SECONDS } from '@/lib/constants';

export default function CaptureScreen() {
  const { sessionId, snapPhoto, error } = useKioskState();
  const { streamUrl } = useCamera();
  const { count, start } = useCountdown(COUNTDOWN_SECONDS);
  const [showFlash, setShowFlash] = useState(false);
  const [phase, setPhase] = useState<'ready' | 'countdown' | 'snapping'>('ready');
  const timeoutsRef = useRef<number[]>([]);

  // Start countdown after a brief "Get Ready" pause
  useEffect(() => {
    const timer = setTimeout(() => {
      setPhase('countdown');
      start(COUNTDOWN_SECONDS);
    }, 1500);
    return () => clearTimeout(timer);
  }, [start]);

  // When countdown hits 0: flash → snap photo → transition to review
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count === 0) {
      setShowFlash(true);
      setPhase('snapping');

      const flashTimeout = window.setTimeout(() => setShowFlash(false), 400);
      timeoutsRef.current.push(flashTimeout);

      const snapTimeout = window.setTimeout(() => {
        if (sessionId) snapPhoto();
      }, 300);
      timeoutsRef.current.push(snapTimeout);
    }
  }, [count, phase, sessionId, snapPhoto]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current = [];
    };
  }, []);

  return (
    <div className="kiosk-layout items-center justify-center bg-surface-0 relative overflow-hidden">
      {/* Camera flash */}
      {showFlash && (
        <div className="absolute inset-0 pointer-events-none bg-white/90 z-20" />
      )}

      {/* Loading overlay while snap processes */}
      {phase === 'snapping' && !showFlash && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-surface-0 z-20">
          <div className="w-14 h-14 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xl text-white font-display font-semibold">Taking photo...</p>
          {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
        </div>
      )}

      {/* 1:1 Camera frame — centered square */}
      <div className="relative w-full max-w-lg aspect-square rounded-2xl overflow-hidden"
        style={{ border: '2px solid rgba(255,255,255,0.12)' }}
      >
        {/* Camera feed — hide once snapping */}
        {phase !== 'snapping' && (
          <img
            src={streamUrl}
            alt="Camera feed"
            className="w-full h-full object-cover"
          />
        )}

        {/* "Get Ready!" overlay inside the frame */}
        <AnimatePresence>
          {phase === 'ready' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', bounce: 0.5, duration: 0.8 }}
                className="flex flex-col items-center gap-3"
              >
                <div className="w-16 h-16 rounded-full flex items-center justify-center bg-violet-600/80">
                  <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <p className="text-3xl font-display font-black text-white drop-shadow-lg">
                  Get Ready!
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Countdown numbers inside the frame */}
        <AnimatePresence>
          {phase === 'countdown' && count > 0 && (
            <motion.div
              key={count}
              initial={{ opacity: 0, scale: 2.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
              className="absolute inset-0 flex items-center justify-center bg-black/30"
            >
              <span className="text-9xl font-display font-black text-white drop-shadow-2xl">
                {count}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error display */}
      {error && (
        <p className="absolute bottom-[var(--kiosk-safe-y)] text-red-400 text-sm z-10">{error}</p>
      )}
    </div>
  );
}
