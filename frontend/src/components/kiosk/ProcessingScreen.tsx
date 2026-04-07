import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PROCESSING_MESSAGES, PROCESSING_MESSAGE_INTERVAL_MS } from '@/lib/constants';

export default function ProcessingScreen() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % PROCESSING_MESSAGES.length);
    }, PROCESSING_MESSAGE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-kiosk-background gap-8">
      <div className="w-16 h-16 border-4 border-kiosk-primary border-t-transparent rounded-full animate-spin" />

      <div className="h-12 flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={messageIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="text-2xl text-kiosk-text/80 font-medium"
          >
            {PROCESSING_MESSAGES[messageIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      <p className="text-sm text-kiosk-text/40">This won't take long...</p>
    </div>
  );
}
