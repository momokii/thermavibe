import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useKioskStore } from '@/stores/kioskStore';
import { usePhotoboothState } from '@/hooks/usePhotoboothState';
import { REVEAL_DURATION_SECONDS } from '@/lib/constants';

export default function PhotoboothRevealScreen() {
  const sessionId = useKioskStore((s) => s.sessionId);
  const photoboothCompositeUrl = useKioskStore((s) => s.photoboothCompositeUrl);
  const { printStrip, getShareUrl, shareData, finishPhotobooth } = usePhotoboothState();

  const [qrUrl, setQrUrl] = useState<string | null>(null);

  // Auto-print after 1.5s
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const timer = setTimeout(() => printStrip(), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Generate share URL
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    getShareUrl();
  }, []);

  // Set QR data when available
  useEffect(() => {
    if (shareData?.qr_data) {
      const baseUrl = window.location.origin;
      setQrUrl(`${baseUrl}${shareData.qr_data}`);
    }
  }, [shareData]);

  // Auto-finish after display duration
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const timer = setTimeout(() => finishPhotobooth(), REVEAL_DURATION_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, []);

  const handlePrintAgain = () => printStrip();
  const handleStartOver = () => finishPhotobooth();

  const compositeSrc = photoboothCompositeUrl || (sessionId ? `/api/v1/kiosk/session/${sessionId}/photobooth/composite` : null);

  return (
    <div
      className="kiosk-layout relative bg-surface-0 cursor-pointer overflow-y-auto"
      onClick={handleStartOver}
    >
      {/* Scrollable content */}
      <div
        className="flex flex-col items-center gap-4"
        style={{
          paddingTop: 'max(2rem, var(--kiosk-safe-y))',
          paddingBottom: '4rem',
        }}
      >
        {/* Header */}
        <motion.h2
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-3xl font-display font-black text-white"
        >
          Your Photo Strip!
        </motion.h2>

        {/* Composite image */}
        {compositeSrc && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="rounded-xl overflow-hidden"
            style={{ border: '2px solid rgba(255,255,255,0.12)', maxHeight: '50vh' }}
          >
            <img
              src={compositeSrc}
              alt="Your photobooth strip"
              className="w-auto h-full object-contain"
              style={{ maxHeight: '50vh' }}
            />
          </motion.div>
        )}

        {/* QR code for download */}
        {qrUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="flex flex-col items-center gap-1"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div className="w-28 h-28 bg-white rounded-lg p-2">
              <div className="w-full h-full flex items-center justify-center text-black text-xs text-center">
                Scan to download
              </div>
            </div>
            <p className="text-white/35 text-xs">
              {shareData?.expires_in ? `Link expires in ${Math.floor(shareData.expires_in / 60)} min` : 'Scan to download'}
            </p>
          </motion.div>
        )}

        {/* Action buttons — kiosk-sized touch targets */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="flex gap-4 w-full max-w-md px-6"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handlePrintAgain}
            className="flex-1 py-4 rounded-xl text-white/70 text-lg font-display font-semibold transition-all duration-150 btn-secondary"
          >
            Print Again
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleStartOver}
            className="flex-1 py-4 rounded-xl text-white text-lg font-display font-bold transition-all duration-150 bg-pink-500 hover:bg-pink-600 active:bg-pink-700"
          >
            Start Over
          </motion.button>
        </motion.div>
      </div>

      {/* Fixed bottom hint */}
      <div
        className="absolute bottom-0 left-0 right-0 py-3 text-center pointer-events-none"
        style={{ paddingBottom: 'max(0.75rem, var(--kiosk-safe-y-bottom, 0.75rem))' }}
      >
        <p className="text-sm text-white/25">
          Your strip is printing... Touch to continue
        </p>
      </div>
    </div>
  );
}
