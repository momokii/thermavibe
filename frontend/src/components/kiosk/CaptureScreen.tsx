import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useKioskState } from '@/hooks/useKioskState';
import { useCamera } from '@/hooks/useCamera';
import { useCountdown } from '@/hooks/useCountdown';
import { COUNTDOWN_SECONDS } from '@/lib/constants';

export default function CaptureScreen() {
  const { sessionId, triggerCapture } = useKioskState();
  const { streamUrl } = useCamera();
  const { count, isRunning, start } = useCountdown(COUNTDOWN_SECONDS);
  const [showFlash, setShowFlash] = useState(false);
  const [phase, setPhase] = useState<'ready' | 'countdown' | 'flash'>('ready');

  useEffect(() => {
    const timer = setTimeout(() => {
      setPhase('countdown');
      start(COUNTDOWN_SECONDS);
    }, 1500);
    return () => clearTimeout(timer);
  }, [start]);

  useEffect(() => {
    if (phase === 'countdown' && count === 0 && !isRunning) {
      setPhase('flash');
      setShowFlash(true);
      setTimeout(() => {
        if (sessionId) triggerCapture();
      }, 300);
    }
  }, [count, isRunning, phase, sessionId, triggerCapture]);

  return (
    <div className="w-full h-full relative bg-black">
      <img
        src={streamUrl}
        alt="Camera feed"
        className="w-full h-full object-cover"
      />

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

      {showFlash && (
        <div className="absolute inset-0 bg-white animate-flash pointer-events-none" />
      )}
    </div>
  );
}
