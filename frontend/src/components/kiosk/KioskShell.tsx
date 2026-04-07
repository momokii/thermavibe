import { AnimatePresence, motion } from 'framer-motion';
import { useKioskStore } from '@/stores/kioskStore';
import IdleScreen from './IdleScreen';
import CaptureScreen from './CaptureScreen';
import ProcessingScreen from './ProcessingScreen';
import RevealScreen from './RevealScreen';

const screenTransition = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: 'easeOut' } },
  exit: { opacity: 0, scale: 1.05, transition: { duration: 0.3, ease: 'easeIn' } },
};

export default function KioskShell() {
  const state = useKioskStore((s) => s.state);

  return (
    <div
      className="w-full h-full bg-kiosk-background overflow-hidden relative"
      onContextMenu={(e) => e.preventDefault()}
    >
      <AnimatePresence mode="wait">
        {state === 'idle' && (
          <motion.div key="idle" {...screenTransition} className="absolute inset-0">
            <IdleScreen />
          </motion.div>
        )}
        {state === 'capture' && (
          <motion.div key="capture" {...screenTransition} className="absolute inset-0">
            <CaptureScreen />
          </motion.div>
        )}
        {state === 'processing' && (
          <motion.div key="processing" {...screenTransition} className="absolute inset-0">
            <ProcessingScreen />
          </motion.div>
        )}
        {state === 'reveal' && (
          <motion.div key="reveal" {...screenTransition} className="absolute inset-0">
            <RevealScreen />
          </motion.div>
        )}
        {(state === 'reset' || state === 'payment') && (
          <motion.div key="transition" {...screenTransition} className="absolute inset-0 flex items-center justify-center bg-kiosk-background">
            <div className="w-8 h-8 border-2 border-kiosk-primary border-t-transparent rounded-full animate-spin" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
