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
    <div className="w-full h-full flex flex-col items-center justify-center bg-kiosk-background p-8">
      <AnimatePresence mode="wait">
        {status === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-6"
          >
            <div className="w-12 h-12 border-3 border-kiosk-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xl text-kiosk-text/70">Preparing payment{dots}</p>
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
            <h2 className="text-3xl font-bold text-kiosk-text">Scan to Pay</h2>

            <div className="w-64 h-64 bg-white rounded-2xl flex items-center justify-center p-4">
              <div className="text-center">
                <div className="text-4xl mb-2">QR</div>
                <p className="text-xs text-gray-500">
                  {sessionId ? `Session: ${sessionId.slice(0, 8)}...` : 'Loading...'}
                </p>
              </div>
            </div>

            <p className="text-2xl font-semibold text-kiosk-primary">
              {formatCurrency(5000)}
            </p>

            <p className="text-kiosk-text/60 text-center">
              Waiting for payment{dots}
            </p>

            {countdown !== null && countdown > 0 && (
              <p className="text-sm text-kiosk-text/40">
                Expires in {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
              </p>
            )}

            <button
              onClick={handleCancel}
              className="mt-4 px-6 py-2 text-sm text-kiosk-text/50 hover:text-kiosk-text/80 transition-colors"
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
            <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-2xl text-kiosk-text font-semibold">Payment Confirmed!</p>
            <p className="text-kiosk-text/60">Starting your session...</p>
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
            <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>

            <p className="text-xl text-kiosk-text font-semibold">
              {status === 'expired' ? 'Payment Expired' : 'Payment Failed'}
            </p>

            <button
              onClick={handleCancel}
              className="px-8 py-3 bg-kiosk-primary text-white rounded-xl font-semibold"
            >
              Go Back
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
