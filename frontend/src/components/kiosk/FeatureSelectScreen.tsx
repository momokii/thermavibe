import { motion } from 'framer-motion';
import { useKioskStore } from '@/stores/kioskStore';
import { useKioskState } from '@/hooks/useKioskState';
import { usePhotoboothState } from '@/hooks/usePhotoboothState';

export default function FeatureSelectScreen() {
  const { startSession, isTransitioning: vibeTransitioning } = useKioskState();
  const { startPhotoboothSession, isTransitioning: pbTransitioning } = usePhotoboothState();
  const { vibeCheckEnabled, photoboothEnabled } = useKioskStore();

  const isTransitioning = vibeTransitioning || pbTransitioning;

  const handleVibeCheck = () => {
    if (!isTransitioning && vibeCheckEnabled) startSession();
  };

  const handlePhotobooth = () => {
    if (!isTransitioning && photoboothEnabled) startPhotoboothSession();
  };

  return (
    <div
      className="kiosk-layout items-center justify-center relative overflow-hidden bg-surface-0"
      style={{
        background: 'radial-gradient(ellipse at 50% 40%, rgba(139,92,246,0.08) 0%, transparent 65%)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-12"
      >
        <h1 className="text-5xl font-display font-black text-white mb-3 tracking-tight">
          Choose Your Experience
        </h1>
        <p className="text-lg text-white/50">What would you like to do?</p>
      </motion.div>

      <div className="flex gap-8 items-stretch max-w-4xl w-full px-8">
        {/* Vibe Check Card */}
        {vibeCheckEnabled && (
          <motion.button
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleVibeCheck}
            disabled={isTransitioning}
            className="flex-1 rounded-3xl p-8 flex flex-col items-center justify-center gap-6 min-h-[320px] cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(99,102,241,0.1) 100%)',
              border: '1px solid rgba(139,92,246,0.25)',
              backdropFilter: 'blur(20px)',
            }}
          >
            <div className="text-7xl" role="img" aria-label="sparkles">
              ✨
            </div>
            <div className="text-center">
              <h2 className="text-3xl font-display font-bold text-white mb-2">Vibe Check</h2>
              <p className="text-white/60 text-lg">AI reads your vibe from a photo</p>
            </div>
            <div className="px-6 py-2 rounded-xl bg-violet-500/20 text-violet-300 text-sm font-medium">
              1 Photo → AI Reading
            </div>
          </motion.button>
        )}

        {/* Photobooth Card */}
        {photoboothEnabled && (
          <motion.button
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handlePhotobooth}
            disabled={isTransitioning}
            className="flex-1 rounded-3xl p-8 flex flex-col items-center justify-center gap-6 min-h-[320px] cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, rgba(236,72,153,0.15) 0%, rgba(244,114,182,0.1) 100%)',
              border: '1px solid rgba(236,72,153,0.25)',
              backdropFilter: 'blur(20px)',
            }}
          >
            <div className="text-7xl" role="img" aria-label="photo strip">
              📸
            </div>
            <div className="text-center">
              <h2 className="text-3xl font-display font-bold text-white mb-2">Photobooth</h2>
              <p className="text-white/60 text-lg">Create a photo strip with frames</p>
            </div>
            <div className="px-6 py-2 rounded-xl bg-pink-500/20 text-pink-300 text-sm font-medium">
              Multi-Photo → Styled Strip
            </div>
          </motion.button>
        )}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.35 }}
        transition={{ delay: 1 }}
        className="text-base text-white/35 mt-10"
      >
        {isTransitioning ? 'Starting...' : 'Tap to choose'}
      </motion.p>
    </div>
  );
}
