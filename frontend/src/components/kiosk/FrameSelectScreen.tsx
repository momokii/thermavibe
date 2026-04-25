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
    queryFn: () => photoboothApi.listThemes().then((r: { data: ThemeResponse[] }) => r.data),
  });

  const handleConfirm = () => {
    if (selectedThemeId !== null) {
      selectFrame(selectedThemeId, selectedRows);
    }
  };

  return (
    <div className="kiosk-layout bg-surface-0 relative overflow-y-auto">
      {/* Header */}
      <div
        className="text-center"
        style={{
          paddingTop: 'max(2rem, var(--kiosk-safe-y))',
          paddingBottom: '1.5rem',
        }}
      >
        <motion.h2
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-display font-black text-white"
        >
          Choose Your Frame
        </motion.h2>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-start gap-6 px-6 pb-4">
        {/* Theme selection */}
        <div className="w-full max-w-2xl">
          <p className="text-white/40 text-xs font-medium uppercase tracking-wider text-center mb-3">
            Select a theme
          </p>
          <div className="flex gap-4 justify-center">
            {themes.map((theme: ThemeResponse) => (
              <motion.button
                key={theme.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedThemeId(theme.id)}
                className={`flex-shrink-0 w-32 h-40 rounded-xl p-3 flex flex-col items-center justify-center gap-3 border-2 transition-all duration-200 ${
                  selectedThemeId === theme.id
                    ? 'border-pink-500 bg-pink-500/10'
                    : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
              >
                {/* Color preview */}
                <div
                  className="w-12 h-12 rounded-lg"
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
          <p className="text-white/40 text-xs font-medium uppercase tracking-wider text-center mb-3">
            Number of photos
          </p>
          <div className="flex gap-4 justify-center">
            {LAYOUT_OPTIONS.map((rows) => (
              <motion.button
                key={rows}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedRows(rows)}
                className={`w-24 h-24 rounded-xl flex flex-col items-center justify-center gap-1 border-2 transition-all duration-200 ${
                  selectedRows === rows
                    ? 'border-pink-500 bg-pink-500/10'
                    : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
              >
                <span className="text-3xl font-display font-bold text-white">{rows}</span>
                <span className="text-[10px] text-white/40">{rows === 1 ? 'photo' : 'photos'}</span>
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom action */}
      <div className="pb-6 pt-2">
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleConfirm}
          disabled={selectedThemeId === null || isTransitioning}
          className="w-full max-w-md mx-auto block py-4 rounded-xl text-white text-lg font-display font-bold disabled:opacity-30 transition-all duration-150 btn-primary"
        >
          {isTransitioning ? 'Selecting...' : 'Select Frame'}
        </motion.button>
      </div>
    </div>
  );
}
