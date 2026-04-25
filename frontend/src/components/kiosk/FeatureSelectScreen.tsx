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
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center"
        style={{ marginBottom: '3rem' }}
      >
        <h1 className="text-4xl font-display font-black text-white mb-3 tracking-tight">
          Choose Your Experience
        </h1>
        <p className="text-base text-white/45">What would you like to do?</p>
      </motion.div>

      {/* Feature cards */}
      <div className="flex gap-6 items-stretch max-w-3xl w-full px-10">
        {/* Vibe Check Card */}
        {vibeCheckEnabled && (
          <motion.button
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleVibeCheck}
            disabled={isTransitioning}
            className="flex-1 rounded-2xl flex flex-col items-center justify-center cursor-pointer"
            style={{
              padding: '3rem 2.5rem',
              gap: '1.5rem',
              minHeight: '420px',
              background: 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(99,102,241,0.08) 100%)',
              border: '2px solid rgba(139,92,246,0.3)',
            }}
          >
            <div className="text-6xl" role="img" aria-label="sparkles">✨</div>
            <div className="text-center">
              <h2 className="text-2xl font-display font-bold text-white mb-2">Vibe Check</h2>
              <p className="text-white/55 text-sm leading-relaxed">AI reads your vibe from a photo</p>
            </div>
            <div
              className="rounded-xl font-medium"
              style={{
                padding: '0.75rem 1.75rem',
                background: 'rgba(139,92,246,0.2)',
                color: 'rgb(196,181,253)',
                fontSize: '0.875rem',
              }}
            >
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
            whileTap={{ scale: 0.97 }}
            onClick={handlePhotobooth}
            disabled={isTransitioning}
            className="flex-1 rounded-2xl flex flex-col items-center justify-center cursor-pointer"
            style={{
              padding: '3rem 2.5rem',
              gap: '1.5rem',
              minHeight: '420px',
              background: 'linear-gradient(135deg, rgba(236,72,153,0.15) 0%, rgba(244,114,182,0.08) 100%)',
              border: '2px solid rgba(236,72,153,0.3)',
            }}
          >
            <div className="text-6xl" role="img" aria-label="photo strip">📸</div>
            <div className="text-center">
              <h2 className="text-2xl font-display font-bold text-white mb-2">Photobooth</h2>
              <p className="text-white/55 text-sm leading-relaxed">Create a photo strip with frames</p>
            </div>
            <div
              className="rounded-xl font-medium"
              style={{
                padding: '0.75rem 1.75rem',
                background: 'rgba(236,72,153,0.2)',
                color: 'rgb(249,168,212)',
                fontSize: '0.875rem',
              }}
            >
              Multi-Photo → Styled Strip
            </div>
          </motion.button>
        )}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.35 }}
        transition={{ delay: 1 }}
        className="text-sm text-white/30 mt-8"
      >
        {isTransitioning ? 'Starting...' : 'Tap to choose'}
      </motion.p>
    </div>
  );
}
