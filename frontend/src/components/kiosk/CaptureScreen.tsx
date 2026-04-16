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

      {/* White camera flash — auto-dismissed after 400ms */}
      {showFlash && (
        <div className="absolute inset-0 bg-white pointer-events-none" />
      )}

      {/* Brief loading overlay while snap processes */}
      {phase === 'snapping' && !showFlash && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-4">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
          <p className="text-xl text-white">Taking photo...</p>

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
            className="absolute inset-0 flex items-center justify-center bg-black/40"
          >
            <p className="text-4xl font-bold text-white">Get Ready!</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Countdown numbers */}
      <AnimatePresence>
        {phase === 'countdown' && count > 0 && (
          <motion.div
            key={count}
            initial={{ opacity: 0, scale: 2 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <span className="text-8xl font-bold text-white drop-shadow-2xl">
              {count}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
