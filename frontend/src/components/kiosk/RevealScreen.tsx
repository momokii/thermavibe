import { useEffect, useState, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useKioskState } from '@/hooks/useKioskState';
import { useKioskStore } from '@/stores/kioskStore';
import { REVEAL_DURATION_SECONDS } from '@/lib/constants';

export default function RevealScreen() {
  const { sessionData, triggerPrint, finishSession, error } = useKioskState();
  const storeReset = useKioskStore((s) => s.reset);
  const [displayedText, setDisplayedText] = useState('');
  const fullText = sessionData?.analysis_text ?? '';
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingDoneRef = useRef(false);

  // Typewriter effect
  useEffect(() => {
    if (!fullText) return;
    let i = 0;
    typingDoneRef.current = false;
    const timer = setInterval(() => {
      if (i < fullText.length) {
        i++;
        setDisplayedText(fullText.slice(0, i));
      } else {
        typingDoneRef.current = true;
        clearInterval(timer);
      }
    }, 25);
    return () => clearInterval(timer);
  }, [fullText]);

  // Auto-scroll to bottom as text types
  useEffect(() => {
    if (scrollRef.current && !typingDoneRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayedText]);

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
      className="kiosk-layout relative bg-surface-0 cursor-pointer"
      onClick={handleTouch}
    >
      {/* Scrollable content area — scrollbar hidden for kiosk */}
      <div
        ref={scrollRef}
        className="kiosk-scroll"
        style={{
          paddingTop: 'max(2rem, var(--kiosk-safe-y))',
          paddingBottom: '4rem',
        }}
      >
        <div className="kiosk-scroll-inner">
          {/* Header */}
          <motion.h2
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-3xl font-display font-black text-white text-center"
            style={{ marginBottom: '2rem' }}
          >
            Your Vibe Reading
          </motion.h2>

          {/* Photo — centered, always fully visible */}
          {sessionData?.capture_image_url && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
              className="flex justify-center"
              style={{ marginBottom: '2rem' }}
            >
              <div
                className="relative rounded-xl overflow-hidden aspect-square w-64"
                style={{ border: '2px solid rgba(255,255,255,0.12)' }}
              >
                <img
                  src={sessionData.capture_image_url}
                  alt="Your photo"
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>
          )}

          {/* Typewriter text */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-center px-4"
          >
            <p className="text-xl text-white leading-relaxed whitespace-pre-line font-display font-medium">
              {displayedText}
              {displayedText.length < fullText.length && (
                <span className="animate-pulse text-violet-400">|</span>
              )}
            </p>
          </motion.div>
        </div>
      </div>

      {/* Fixed bottom bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-0 left-0 right-0 py-3 text-center pointer-events-none"
        style={{ paddingBottom: 'max(0.75rem, var(--kiosk-safe-y-bottom, 0.75rem))' }}
      >
        <AnimatePresence>
          {error && (
            <motion.div
              key="error-banner"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="px-6 py-3 bg-red-500/15 border border-red-500/30 text-red-300 rounded-xl text-sm max-w-md mx-auto text-center mb-3"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>
        <p className="text-sm text-white/30">
          Your receipt is printing... Touch to continue
        </p>
      </motion.div>
    </div>
  );
}
