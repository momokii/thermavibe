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
      // Construct full URL from relative path
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
      className="kiosk-layout items-center justify-center gap-4 relative bg-surface-0 overflow-y-auto py-6"
      onClick={handleStartOver}
      onTouchStart={handleStartOver}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="flex flex-col items-center gap-6"
      >
        <h2 className="text-3xl font-display font-bold text-white">Your Photo Strip!</h2>

        {/* Composite image */}
        {compositeSrc && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-xl overflow-hidden border border-white/10 shadow-2xl"
            style={{ maxHeight: '50vh' }}
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
            className="flex flex-col items-center gap-2"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div className="w-32 h-32 bg-white rounded-lg p-2">
              {/* Simple QR placeholder - in production use a QR library */}
              <div className="w-full h-full flex items-center justify-center text-black text-xs text-center">
                Scan to download
              </div>
            </div>
            <p className="text-white/40 text-xs">
              {shareData?.expires_in ? `Link expires in ${Math.floor(shareData.expires_in / 60)} min` : 'Scan to download'}
            </p>
          </motion.div>
        )}

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="flex gap-4"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <button
            onClick={handlePrintAgain}
            className="px-6 py-3 rounded-xl bg-white/10 text-white font-medium border border-white/20"
          >
            Print Again
          </button>
          <button
            onClick={handleStartOver}
            className="px-6 py-3 rounded-xl bg-pink-500 text-white font-medium"
          >
            Start Over
          </button>
        </motion.div>

        <p className="text-white/30 text-sm">Tap anywhere to continue</p>
      </motion.div>
    </div>
  );
}
