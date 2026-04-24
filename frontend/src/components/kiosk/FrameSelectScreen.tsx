import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useKioskStore } from '@/stores/kioskStore';
import { usePhotoboothState } from '@/hooks/usePhotoboothState';
import { photoboothApi } from '@/api/photoboothApi';
import type { ThemeResponse } from '@/api/types';

const LAYOUT_OPTIONS = [1, 2, 3, 4];

export default function FrameSelectScreen() {
  const photoboothLayoutRows = useKioskStore((s) => s.photoboothLayoutRows);
  const { selectFrame, isTransitioning } = usePhotoboothState();

  const [selectedThemeId, setSelectedThemeId] = useState<number | null>(null);
  const [selectedRows, setSelectedRows] = useState(photoboothLayoutRows);

  // Fetch available themes
  const { data: themes = [] } = useQuery({
    queryKey: ['photobooth-themes'],
    queryFn: () => photoboothApi.listThemes().then((r) => r.data),
  });

  const handleConfirm = () => {
    if (selectedThemeId !== null) {
      selectFrame(selectedThemeId, selectedRows);
    }
  };

  return (
    <div className="kiosk-layout items-center justify-center gap-6 relative bg-surface-0 overflow-y-auto py-8">
      <motion.h2
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl font-display font-bold text-white"
      >
        Choose Your Frame
      </motion.h2>

      {/* Theme selection */}
      <div className="w-full max-w-2xl">
        <p className="text-white/50 text-sm mb-3 text-center">Select a theme</p>
        <div className="flex gap-3 overflow-x-auto px-4 pb-2">
          {themes.map((theme: ThemeResponse) => (
            <motion.button
              key={theme.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedThemeId(theme.id)}
              className={`flex-shrink-0 w-28 h-36 rounded-xl p-3 flex flex-col items-center justify-center gap-2 border-2 transition-colors ${
                selectedThemeId === theme.id
                  ? 'border-pink-500 bg-pink-500/10'
                  : 'border-white/10 bg-white/5'
              }`}
            >
              {/* Color preview */}
              <div
                className="w-10 h-10 rounded-lg"
                style={{
                  background: theme.config.background?.type === 'gradient'
                    ? `linear-gradient(135deg, ${theme.config.background.gradient_start}, ${theme.config.background.gradient_end})`
                    : theme.config.background?.color || '#000',
                  borderColor: theme.config.photo_slot?.border_color || '#fff',
                  borderWidth: `${theme.config.photo_slot?.border_width || 0}px`,
                }}
              />
              <span className="text-xs text-white/70 font-medium text-center leading-tight">
                {theme.display_name}
              </span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Layout selection */}
      <div className="w-full max-w-2xl">
        <p className="text-white/50 text-sm mb-3 text-center">Number of photos</p>
        <div className="flex gap-3 justify-center">
          {LAYOUT_OPTIONS.map((rows) => (
            <motion.button
              key={rows}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedRows(rows)}
              className={`w-20 h-20 rounded-xl flex flex-col items-center justify-center gap-1 border-2 transition-colors ${
                selectedRows === rows
                  ? 'border-pink-500 bg-pink-500/10'
                  : 'border-white/10 bg-white/5'
              }`}
            >
              <span className="text-2xl font-display font-bold text-white">{rows}</span>
              <span className="text-[10px] text-white/50">{rows === 1 ? 'photo' : 'photos'}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Confirm button */}
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleConfirm}
        disabled={selectedThemeId === null || isTransitioning}
        className="px-12 py-4 rounded-2xl bg-pink-500 text-white font-display font-bold text-xl disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isTransitioning ? 'Selecting...' : 'Select Frame'}
      </motion.button>
    </div>
  );
}
