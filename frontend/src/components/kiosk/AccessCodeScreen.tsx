import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useKioskStore } from '@/stores/kioskStore';
import { kioskApi } from '@/api/kioskApi';
import VirtualNumpad from './VirtualNumpad';

export default function AccessCodeScreen() {
  const sessionId = useKioskStore((s) => s.sessionId);
  const sessionType = useKioskStore((s) => s.sessionType);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleKey = useCallback((key: string) => {
    setCode((prev) => (prev.length < 12 ? prev + key : prev));
    setError(null);
  }, []);

  const handleBackspace = useCallback(() => {
    setCode((prev) => prev.slice(0, -1));
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed || !sessionId) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const validation = await kioskApi.validateAccessCode({
        code: trimmed,
        session_type: sessionType,
      });

      if (!validation.data.valid) {
        setError(validation.data.message);
        setIsSubmitting(false);
        return;
      }

      const result = await kioskApi.redeemAccessCode(sessionId, trimmed);
      const { setSession } = useKioskStore.getState();
      setSession(sessionId, result.data);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Validation failed. Please try again.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [code, sessionId, sessionType]);

  const handleBack = useCallback(() => {
    const { setState, reset } = useKioskStore.getState();
    reset();
    setState('idle');
  }, []);

  return (
    <div className="kiosk-layout items-center justify-center gap-6 px-6">
      {/* Back button */}
      <button
        onClick={handleBack}
        className="absolute top-[var(--kiosk-safe-y)] left-6 text-white/50 hover:text-white
                   text-lg font-medium z-10"
      >
        ← Back
      </button>

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-4"
      >
        <h2 className="text-4xl font-display font-bold text-white">Enter Access Code</h2>
        <p className="text-white/50 text-lg">Type your code or scan a QR</p>
      </motion.div>

      {/* Code display */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="w-full max-w-lg"
      >
        <div
          className="w-full h-16 rounded-2xl bg-white/10 border-2 border-white/20
                     flex items-center justify-center text-3xl font-mono tracking-[0.3em] text-white"
        >
          {code || <span className="text-white/25 text-xl">CODE</span>}
        </div>
      </motion.div>

      {/* Error display */}
      <AnimatePresence>
        {error && (
          <motion.div
            key="access-code-error"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="px-6 py-3 bg-red-500/15 border border-red-500/30 text-red-300
                       rounded-xl text-sm max-w-md text-center"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Numpad */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="w-full max-w-lg"
      >
        <VirtualNumpad
          onKey={handleKey}
          onBackspace={handleBackspace}
          onSubmit={handleSubmit}
        />
      </motion.div>

      {/* Loading overlay */}
      {isSubmitting && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20">
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
