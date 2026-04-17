import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PROCESSING_MESSAGES, PROCESSING_MESSAGE_INTERVAL_MS } from '@/lib/constants';
import { useKioskStore } from '@/stores/kioskStore';

export default function ProcessingScreen() {
  const error = useKioskStore((s) => s.error);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % PROCESSING_MESSAGES.length);
    }, PROCESSING_MESSAGE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden bg-surface-0">
      <AnimatePresence>
        {error && (
          <motion.div
            key="error-banner"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 px-6 py-3 bg-red-500/15 border border-red-500/30 text-red-300 rounded-xl text-sm max-w-md text-center z-10"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Animated rings */}
      <div className="relative w-32 h-32 flex items-center justify-center mb-6">
        <div className="absolute inset-0 rounded-full ring-pulse"
          style={{ border: '2px solid rgba(139,92,246,0.25)', animationDelay: '0s' }}
        />
        <div className="absolute inset-0 rounded-full ring-pulse"
          style={{ border: '2px solid rgba(139,92,246,0.15)', animationDelay: '0.8s' }}
        />
        <div className="absolute inset-0 rounded-full ring-pulse"
          style={{ border: '2px solid rgba(139,92,246,0.08)', animationDelay: '1.6s' }}
        />
        {/* Center dot */}
        <div className="w-4 h-4 rounded-full bg-violet-600 animate-pulse" />
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
            className="text-2xl font-display font-bold text-white/80"
          >
            {PROCESSING_MESSAGES[messageIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      <p className="text-sm text-white/30 relative z-10">This won&apos;t take long...</p>
    </div>
  );
}
