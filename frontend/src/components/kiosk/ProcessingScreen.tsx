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
    <div className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at 50% 50%, rgba(139,92,246,0.12) 0%, transparent 60%), #0f0a1a',
      }}
    >
      {/* Decorative floating blobs */}
      <div className="blob blob-violet w-64 h-64 top-1/4 left-1/4 animate-float opacity-10" />
      <div className="blob blob-pink w-48 h-48 bottom-1/3 right-1/4 animate-float-slow opacity-10" />

      {/* Floating particles (reduced from 6 to 4) */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full float-particle"
            style={{
              left: `${20 + i * 20}%`,
              top: `${25 + (i % 2) * 30}%`,
              background: i % 2 === 0 ? '#8b5cf6' : '#ec4899',
              opacity: 0.35,
              animationDelay: `${i * 1}s`,
            }}
          />
        ))}
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            key="error-banner"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 px-6 py-3 bg-red-500/20 border border-red-500/50 text-red-300 rounded-xl text-sm max-w-md text-center z-10"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Animated gradient orb rings — tighter gap to message */}
      <div className="relative w-32 h-32 flex items-center justify-center mb-6">
        {/* Outer ring */}
        <div className="absolute inset-0 rounded-full ring-pulse"
          style={{ border: '2px solid rgba(139,92,246,0.3)', animationDelay: '0s' }}
        />
        {/* Middle ring */}
        <div className="absolute inset-0 rounded-full ring-pulse"
          style={{ border: '2px solid rgba(236,72,153,0.3)', animationDelay: '0.8s' }}
        />
        {/* Inner ring */}
        <div className="absolute inset-0 rounded-full ring-pulse"
          style={{ border: '2px solid rgba(249,115,22,0.2)', animationDelay: '1.6s' }}
        />
        {/* Center dot */}
        <div className="w-5 h-5 rounded-full animate-pulse"
          style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
        />
      </div>

      {/* Rotating message — tighter container */}
      <div className="h-12 flex items-center justify-center mb-3 relative z-10">
        <AnimatePresence mode="wait">
          <motion.p
            key={messageIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="text-3xl font-display font-bold text-gradient-vibe"
          >
            {PROCESSING_MESSAGES[messageIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      <p className="text-sm text-kiosk-text/40 relative z-10">This won&apos;t take long...</p>
    </div>
  );
}
