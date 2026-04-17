import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useKioskStore } from '@/stores/kioskStore';
import { paymentApi } from '@/api/paymentApi';

const POLL_INTERVAL_MS = 3000;

export default function PaymentScreen() {
  const sessionId = useKioskStore((s) => s.sessionId);
  const sessionData = useKioskStore((s) => s.sessionData);
  const setState = useKioskStore((s) => s.setState);
  const setError = useKioskStore((s) => s.setError);
  const reset = useKioskStore((s) => s.reset);

  const [status, setStatus] = useState<'loading' | 'pending' | 'confirmed' | 'expired' | 'error'>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [dots, setDots] = useState('');

  // Animated dots for "Waiting for payment..."
  useEffect(() => {
    const timer = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(timer);
  }, []);

  // Create QR payment on mount
  useEffect(() => {
    if (!sessionId) return;

    const createPayment = async () => {
      try {
        await paymentApi.createQR({
          session_id: sessionId,
          amount: sessionData?.payment_status ? 5000 : 5000,
          currency: 'IDR',
        });
        setStatus('pending');

        // Start countdown from payment timeout (default 120s)
        setCountdown(120);
      } catch {
        setStatus('error');
        setError('Failed to create payment. Please try again.');
      }
    };

    createPayment();
  }, [sessionId, sessionData, setError]);

  // Countdown timer
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          setStatus('expired');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  // Poll payment status
  useEffect(() => {
    if (status !== 'pending' || !sessionId) return;

    const poll = async () => {
      try {
        const response = await paymentApi.getStatus(sessionId);
        const paymentStatus = response.data.status;

        if (paymentStatus === 'confirmed') {
          setStatus('confirmed');
          // Transition to capture after a brief success display
          setTimeout(() => setState('capture'), 1500);
        } else if (paymentStatus === 'expired' || paymentStatus === 'denied') {
          setStatus('expired');
          setError('Payment expired or was denied.');
        }
      } catch {
        // Polling failure is non-blocking — keep trying
      }
    };

    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [status, sessionId, setState, setError]);

  const handleCancel = useCallback(() => {
    reset();
  }, [reset]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8 relative overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at 50% 30%, rgba(139,92,246,0.12) 0%, transparent 60%), #0f0a1a',
      }}
    >
      <AnimatePresence mode="wait">
        {status === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-6"
          >
            <div className="w-12 h-12 border-[3px] border-kiosk-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xl text-kiosk-text/70 font-display">Preparing payment{dots}</p>
          </motion.div>
        )}

        {status === 'pending' && (
          <motion.div
            key="pending"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center gap-6"
          >
            <h2 className="text-3xl font-display font-black text-gradient-vibe">Scan to Pay</h2>

            {/* QR code area with glass card + glow */}
            <div className="w-64 h-64 glass-card rounded-2xl flex items-center justify-center p-4"
              style={{
                boxShadow: '0 0 30px rgba(139,92,246,0.15), 0 0 60px rgba(236,72,153,0.08)',
                border: '1px solid rgba(139,92,246,0.2)',
              }}
            >
              <div className="text-center">
                <div className="text-4xl mb-2 text-kiosk-text/30">QR</div>
                <p className="text-xs text-kiosk-text/40">
                  {sessionId ? `Session: ${sessionId.slice(0, 8)}...` : 'Loading...'}
                </p>
              </div>
            </div>

            {/* Amount with gradient text */}
            <p className="text-2xl font-display font-black text-gradient-vibe">
              {formatCurrency(5000)}
            </p>

            <p className="text-kiosk-text/50 font-display text-center">
              Waiting for payment{dots}
            </p>

            {countdown !== null && countdown > 0 && (
              <div className="flex items-center gap-2">
                <div className="relative w-8 h-8">
                  <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
                    <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
                    <circle
                      cx="16" cy="16" r="13" fill="none"
                      stroke="url(#countdown-grad)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 13}`}
                      strokeDashoffset={`${2 * Math.PI * 13 * (1 - countdown / 120)}`}
                      className="transition-all duration-1000"
                    />
                    <defs>
                      <linearGradient id="countdown-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#8b5cf6" />
                        <stop offset="100%" stopColor="#ec4899" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                <span className="text-sm text-kiosk-text/40 font-mono">
                  {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
                </span>
              </div>
            )}

            <button
              onClick={handleCancel}
              className="mt-4 px-6 py-2 text-sm text-kiosk-text/40 hover:text-kiosk-text/70 transition-colors font-display"
            >
              Cancel
            </button>
          </motion.div>
        )}

        {status === 'confirmed' && (
          <motion.div
            key="confirmed"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.05))',
                border: '2px solid rgba(34,197,94,0.5)',
                boxShadow: '0 0 20px rgba(34,197,94,0.2)',
              }}
            >
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-2xl text-kiosk-text font-display font-bold">Payment Confirmed!</p>
            <p className="text-kiosk-text-muted/60 font-display">Starting your session...</p>
          </motion.div>
        )}

        {(status === 'expired' || status === 'error') && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-6"
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.05))',
                border: '2px solid rgba(239,68,68,0.4)',
                boxShadow: '0 0 20px rgba(239,68,68,0.15)',
              }}
            >
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>

            <p className="text-xl text-kiosk-text font-display font-semibold">
              {status === 'expired' ? 'Payment Expired' : 'Payment Failed'}
            </p>

            <button
              onClick={handleCancel}
              className="px-8 py-3 rounded-2xl text-white font-display font-semibold"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
            >
              Go Back
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
