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

      // Auto-dismiss flash overlay after 400ms
      const flashTimeout = window.setTimeout(() => setShowFlash(false), 400);
      timeoutsRef.current.push(flashTimeout);

      // Trigger the backend snap (photo only, no AI)
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
    <div className="w-full h-full relative bg-black">
      {/* Camera feed — hide once snapping */}
      {phase !== 'snapping' && (
        <img
          src={streamUrl}
          alt="Camera feed"
          className="w-full h-full object-cover"
        />
      )}

      {/* Gradient camera flash — auto-dismissed after 400ms */}
      {showFlash && (
        <div className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, rgba(139,92,246,0.6), rgba(236,72,153,0.6), rgba(255,255,255,0.9))',
          }}
        />
      )}

      {/* Brief loading overlay while snap processes */}
      {phase === 'snapping' && !showFlash && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4"
          style={{ background: 'linear-gradient(180deg, rgba(15,10,26,0.9), rgba(15,10,26,0.95))' }}
        >
          <div className="w-14 h-14 border-4 border-kiosk-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xl text-kiosk-text font-display font-semibold">Taking photo...</p>

          {error && (
            <p className="text-red-400 text-sm mt-4">{error}</p>
          )}
        </div>
      )}

      {/* "Get Ready!" overlay */}
      <AnimatePresence>
        {phase === 'ready' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'linear-gradient(180deg, rgba(15,10,26,0.3), rgba(139,92,246,0.2), rgba(15,10,26,0.3))' }}
          >
            <motion.p
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', bounce: 0.5, duration: 0.8 }}
              className="text-5xl font-display font-black text-gradient-vibe drop-shadow-lg"
            >
              Get Ready!
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Countdown numbers with bounce */}
      <AnimatePresence>
        {phase === 'countdown' && count > 0 && (
          <motion.div
            key={count}
            initial={{ opacity: 0, scale: 2.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <span className="text-9xl font-display font-black text-white drop-shadow-2xl"
              style={{ textShadow: '0 0 40px rgba(139,92,246,0.5), 0 0 80px rgba(236,72,153,0.3)' }}
            >
              {count}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
