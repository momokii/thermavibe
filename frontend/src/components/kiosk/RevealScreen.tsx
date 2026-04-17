import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useKioskState } from '@/hooks/useKioskState';
import { useKioskStore } from '@/stores/kioskStore';
import { REVEAL_DURATION_SECONDS } from '@/lib/constants';

export default function RevealScreen() {
  const { sessionData, triggerPrint, finishSession, error } = useKioskState();
  const storeReset = useKioskStore((s) => s.reset);
  const [displayedText, setDisplayedText] = useState('');
  const fullText = sessionData?.analysis_text ?? '';

  // Typewriter effect
  useEffect(() => {
    if (!fullText) return;
    let i = 0;
    const timer = setInterval(() => {
      if (i < fullText.length) {
        setDisplayedText(fullText.slice(0, i + 1));
        i++;
      } else {
        clearInterval(timer);
      }
    }, 30);
    return () => clearInterval(timer);
  }, [fullText]);

  // Print + auto-reset
  useEffect(() => {
    if (!fullText) return;
    const printTimer = setTimeout(() => {
      triggerPrint();
    }, 1000);
    const resetTimer = setTimeout(() => {
      finishSession();
    }, REVEAL_DURATION_SECONDS * 1000);
    return () => {
      clearTimeout(printTimer);
      clearTimeout(resetTimer);
    };
  }, [fullText, triggerPrint, finishSession]);

  const handleTouch = useCallback(() => {
    if (error) {
      storeReset();
      return;
    }
    finishSession();
  }, [error, storeReset, finishSession]);

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center p-8 cursor-pointer relative overflow-hidden bg-surface-0"
      onClick={handleTouch}
    >
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
            <span className="block mt-1 text-xs text-red-300/50">Touch anywhere to go back</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.h2
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-3xl font-display font-black text-white mb-6 relative z-10"
      >
        Your Vibe Reading
      </motion.h2>

      {/* Photo with clean border */}
      {sessionData?.capture_image_url && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
          className="relative mb-6 rounded-xl overflow-hidden"
          style={{ border: '2px solid rgba(255,255,255,0.12)' }}
        >
          <img
            src={sessionData.capture_image_url}
            alt="Your photo"
            className="w-52 h-52 object-cover"
          />
        </motion.div>
      )}

      {/* Typewriter text */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="max-w-lg text-center relative z-10"
      >
        <p className="text-2xl text-white leading-relaxed whitespace-pre-line font-display font-medium">
          {displayedText}
          {displayedText.length < fullText.length && (
            <span className="animate-pulse text-violet-400">|</span>
          )}
        </p>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ delay: 2 }}
        className="mt-8 text-sm text-white/35 relative z-10"
      >
        Your receipt is printing... Touch to continue
      </motion.p>
    </div>
  );
}
