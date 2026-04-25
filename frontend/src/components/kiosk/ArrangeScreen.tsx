import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useKioskStore } from '@/stores/kioskStore';
import { usePhotoboothState } from '@/hooks/usePhotoboothState';

const DEFAULT_TIMER_SECONDS = 30;

export default function ArrangeScreen() {
  const photos = useKioskStore((s) => s.photos);
  const sessionId = useKioskStore((s) => s.sessionId);
  const photoboothLayoutRows = useKioskStore((s) => s.photoboothLayoutRows);
  const photoboothPhotoAssignments = useKioskStore((s) => s.photoboothPhotoAssignments);
  const captureTimeLimit = useKioskStore((s) => s.photoboothCaptureTimeLimit);
  const { arrangePhotos, isArranging, arrangeError } = usePhotoboothState();

  const [selectedPhoto, setSelectedPhoto] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<Record<number, number>>(photoboothPhotoAssignments);

  // Timer state
  const [timeLeft, setTimeLeft] = useState(captureTimeLimit);
  const isUrgent = timeLeft <= 10;

  const handlePhotoClick = (photoIdx: number) => {
    setSelectedPhoto(photoIdx);
  };

  const handleSlotClick = (slotIdx: number) => {
    if (selectedPhoto !== null) {
      const updated = { ...assignments, [slotIdx]: selectedPhoto };
      setAssignments(updated);
      setSelectedPhoto(null);
    } else if (assignments[slotIdx] !== undefined) {
      const updated = { ...assignments };
      delete updated[slotIdx];
      setAssignments(updated);
    }
  };

  const allSlotsFilled = Array.from({ length: photoboothLayoutRows }, (_, i) => i).every(
    (i) => assignments[i] !== undefined,
  );

  const handleConfirm = () => {
    if (allSlotsFilled) {
      arrangePhotos(assignments);
    }
  };

  // Countdown timer
  const hasAutoAdvanced = useRef(false);
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 0.1));
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Auto-advance on timeout
  useEffect(() => {
    if (timeLeft <= 0 && !hasAutoAdvanced.current && photos.length > 0) {
      hasAutoAdvanced.current = true;
      const finalAssignments = { ...assignments };
      for (let slot = 0; slot < photoboothLayoutRows; slot++) {
        if (finalAssignments[slot] === undefined) {
          finalAssignments[slot] = Math.floor(Math.random() * photos.length);
        }
      }
      arrangePhotos(finalAssignments);
    }
  }, [timeLeft, assignments, photoboothLayoutRows, photos, arrangePhotos]);

  // Build photo URL from photo entry
  const getPhotoUrl = (photoIdx: number) => {
    const entry = photos[photoIdx];
    if (entry?.photo_url) return entry.photo_url;
    if (sessionId) return `/api/v1/kiosk/session/${sessionId}/photo/${photoIdx}`;
    return null;
  };

  return (
    <div className="kiosk-layout bg-surface-0 relative overflow-y-auto">
      {/* Header */}
      <div
        className="text-center"
        style={{
          paddingTop: 'max(2rem, var(--kiosk-safe-y))',
          paddingBottom: '1rem',
        }}
      >
        {/* Timer badge */}
        <div className="flex items-center justify-start w-full px-6 pb-2">
          <div className={`px-4 py-2 rounded-xl backdrop-blur-sm font-display font-bold text-sm ${
            isUrgent ? 'bg-red-500/80 text-white' : 'bg-black/50 text-white/90'
          }`}>
            {Math.ceil(timeLeft)}s
          </div>
        </div>

        <motion.h2
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-display font-black text-white"
        >
          Arrange Your Photos
        </motion.h2>
        <p className="text-white/40 text-sm mt-1">Tap a photo, then tap a slot to place it</p>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-start justify-center gap-8 px-8 pb-4">
        {/* Strip preview — vertical column of slots */}
        <div className="flex flex-col items-center gap-3">
          <p className="text-white/40 text-xs font-medium uppercase tracking-wider mb-1">Your Strip</p>
          {Array.from({ length: photoboothLayoutRows }, (_, slotIdx) => {
            const photoIdx = assignments[slotIdx];
            const isFilled = photoIdx !== undefined;
            const photoUrl = isFilled ? getPhotoUrl(photoIdx) : null;

            return (
              <motion.button
                key={slotIdx}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleSlotClick(slotIdx)}
                className={`w-36 h-36 rounded-xl border-2 flex items-center justify-center overflow-hidden transition-all duration-200 ${
                  isFilled
                    ? 'border-pink-500/60'
                    : 'border-dashed border-white/20 bg-white/5'
                }`}
              >
                {isFilled && photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={`Photo ${photoIdx + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : isFilled ? (
                  <div className="text-white/50 text-sm font-medium">Photo {photoIdx + 1}</div>
                ) : (
                  <div className="text-center">
                    <div className="text-white/20 text-2xl mb-1">+</div>
                    <span className="text-white/25 text-xs">Slot {slotIdx + 1}</span>
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Photo thumbnails — actual captured photos */}
        <div className="flex flex-col items-center gap-3">
          <p className="text-white/40 text-xs font-medium uppercase tracking-wider mb-1">Your Photos</p>
          <div className="grid grid-cols-2 gap-3">
            {photos.map((_, photoIdx) => {
              const photoUrl = getPhotoUrl(photoIdx);
              const isSelected = selectedPhoto === photoIdx;
              const isUsed = Object.values(assignments).includes(photoIdx);

              return (
                <motion.button
                  key={photoIdx}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handlePhotoClick(photoIdx)}
                  className={`w-28 h-28 rounded-xl border-2 flex items-center justify-center overflow-hidden transition-all duration-200 ${
                    isSelected
                      ? 'ring-2 ring-pink-500 ring-offset-2 ring-offset-surface-0 border-pink-500'
                      : isUsed
                        ? 'border-pink-500/30 bg-white/5'
                        : 'border-white/15 bg-white/5'
                  }`}
                >
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt={`Photo ${photoIdx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-white/40 text-sm">Photo {photoIdx + 1}</span>
                  )}
                </motion.button>
              );
            })}
          </div>
          {selectedPhoto !== null && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-pink-400 text-xs font-medium"
            >
              Now tap a slot to place Photo {selectedPhoto + 1}
            </motion.p>
          )}
          {photos.length < photoboothLayoutRows && (
            <p className="text-white/30 text-xs text-center">
              You can reuse any photo to fill all slots
            </p>
          )}
        </div>
      </div>

      {/* Bottom actions */}
      <div className="flex flex-col items-center gap-3 pb-6 pt-2 px-8">
        {arrangeError && (
          <div className="w-full max-w-md text-center">
            <p className="text-red-400 text-sm font-medium mb-1">Failed to create strip</p>
            <p className="text-white/30 text-xs">{arrangeError}</p>
          </div>
        )}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleConfirm}
          disabled={!allSlotsFilled || isArranging}
          className="w-full max-w-md py-4 rounded-xl text-white text-lg font-display font-bold disabled:opacity-30 transition-all duration-150 btn-primary"
        >
          {isArranging ? 'Creating Strip...' : arrangeError ? 'Try Again' : 'Create My Strip'}
        </motion.button>
      </div>
    </div>
  );
}
