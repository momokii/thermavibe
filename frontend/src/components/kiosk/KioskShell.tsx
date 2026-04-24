import { AnimatePresence, motion } from 'framer-motion';
import { useKioskStore } from '@/stores/kioskStore';
import { FEATURE_SELECT_STATE } from '@/lib/constants';
import IdleScreen from './IdleScreen';
import FeatureSelectScreen from './FeatureSelectScreen';
import CaptureScreen from './CaptureScreen';
import ReviewScreen from './ReviewScreen';
import ProcessingScreen from './ProcessingScreen';
import RevealScreen from './RevealScreen';
import PaymentScreen from './PaymentScreen';
import PhotoboothCaptureScreen from './PhotoboothCaptureScreen';
import FrameSelectScreen from './FrameSelectScreen';
import ArrangeScreen from './ArrangeScreen';
import PhotoboothRevealScreen from './PhotoboothRevealScreen';

const screenTransition = {
  initial: { opacity: 0, scale: 0.96, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit: { opacity: 0, scale: 1.03, y: -8, transition: { duration: 0.3, ease: 'easeIn' } },
};

export default function KioskShell() {
  const state = useKioskStore((s) => s.state);
  const sessionType = useKioskStore((s) => s.sessionType);

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
        {state === FEATURE_SELECT_STATE && (
          <motion.div key="feature_select" {...screenTransition} className="absolute inset-0">
            <FeatureSelectScreen />
          </motion.div>
        )}
        {state === 'capture' && (
          <motion.div key="capture" {...screenTransition} className="absolute inset-0">
            {sessionType === 'photobooth' ? <PhotoboothCaptureScreen /> : <CaptureScreen />}
          </motion.div>
        )}
        {state === 'review' && (
          <motion.div key="review" {...screenTransition} className="absolute inset-0">
            <ReviewScreen />
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
        {state === 'payment' && (
          <motion.div key="payment" {...screenTransition} className="absolute inset-0">
            <PaymentScreen />
          </motion.div>
        )}
        {state === 'frame_select' && (
          <motion.div key="frame_select" {...screenTransition} className="absolute inset-0">
            <FrameSelectScreen />
          </motion.div>
        )}
        {state === 'arrange' && (
          <motion.div key="arrange" {...screenTransition} className="absolute inset-0">
            <ArrangeScreen />
          </motion.div>
        )}
        {state === 'compositing' && (
          <motion.div key="compositing" {...screenTransition} className="absolute inset-0">
            <ProcessingScreen />
          </motion.div>
        )}
        {state === 'photobooth_reveal' && (
          <motion.div key="photobooth_reveal" {...screenTransition} className="absolute inset-0">
            <PhotoboothRevealScreen />
          </motion.div>
        )}
        {state === 'reset' && (
          <motion.div key="transition" {...screenTransition} className="absolute inset-0 flex items-center justify-center bg-kiosk-background">
            <div className="w-8 h-8 border-2 border-kiosk-primary border-t-transparent rounded-full animate-spin" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
