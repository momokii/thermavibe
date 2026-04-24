import { useState } from 'react';
import { motion } from 'framer-motion';
import { useKioskStore } from '@/stores/kioskStore';
import { usePhotoboothState } from '@/hooks/usePhotoboothState';

export default function ArrangeScreen() {
  const photos = useKioskStore((s) => s.photos);
  const photoboothLayoutRows = useKioskStore((s) => s.photoboothLayoutRows);
  const photoboothPhotoAssignments = useKioskStore((s) => s.photoboothPhotoAssignments);
  const { arrangePhotos, isArranging } = usePhotoboothState();

  const [selectedPhoto, setSelectedPhoto] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<Record<number, number>>(photoboothPhotoAssignments);

  const handlePhotoClick = (photoIdx: number) => {
    setSelectedPhoto(photoIdx);
  };

  const handleSlotClick = (slotIdx: number) => {
    if (selectedPhoto !== null) {
      const updated = { ...assignments, [slotIdx]: selectedPhoto };
      setAssignments(updated);
      setSelectedPhoto(null);
    } else if (assignments[slotIdx] !== undefined) {
      // Remove assignment
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

  return (
    <div className="kiosk-layout items-center justify-center gap-4 relative bg-surface-0 overflow-y-auto py-6">
      <motion.h2
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl font-display font-bold text-white"
      >
        Arrange Your Photos
      </motion.h2>

      <p className="text-white/50 text-sm">Tap a photo, then tap a slot to place it</p>

      <div className="flex gap-6 items-start max-w-3xl w-full px-4">
        {/* Strip preview with slots */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-white/40 text-xs mb-1">Your Strip</p>
          {Array.from({ length: photoboothLayoutRows }, (_, slotIdx) => {
            const photoIdx = assignments[slotIdx];
            const isFilled = photoIdx !== undefined;
            return (
              <motion.button
                key={slotIdx}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleSlotClick(slotIdx)}
                className={`w-32 h-32 rounded-lg border-2 flex items-center justify-center ${
                  isFilled
                    ? 'border-pink-500/50 bg-pink-500/10'
                    : 'border-dashed border-white/20 bg-white/5'
                }`}
              >
                {isFilled ? (
                  <div className="text-center">
                    <div className="text-2xl mb-1">📷</div>
                    <span className="text-xs text-white/60">Photo {photoIdx + 1}</span>
                  </div>
                ) : (
                  <span className="text-white/30 text-sm">Slot {slotIdx + 1}</span>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Photo thumbnails */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-white/40 text-xs mb-1">Your Photos</p>
          <div className="grid grid-cols-2 gap-2">
            {photos.map((_, photoIdx) => (
              <motion.button
                key={photoIdx}
                whileTap={{ scale: 0.95 }}
                onClick={() => handlePhotoClick(photoIdx)}
                className={`w-20 h-20 rounded-lg border-2 flex items-center justify-center ${
                  selectedPhoto === photoIdx
                    ? 'border-pink-500 bg-pink-500/10'
                    : 'border-white/10 bg-white/5'
                }`}
              >
                <div className="text-center">
                  <div className="text-lg">📷</div>
                  <span className="text-[10px] text-white/50">{photoIdx + 1}</span>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* Confirm button */}
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleConfirm}
        disabled={!allSlotsFilled || isArranging}
        className="px-12 py-4 rounded-2xl bg-pink-500 text-white font-display font-bold text-xl disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isArranging ? 'Creating...' : 'Create My Strip'}
      </motion.button>
    </div>
  );
}
