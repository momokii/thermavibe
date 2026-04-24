/**
 * App-wide constants.
 * API routes, timeouts, defaults.
 */

/** Kiosk state machine states. */
export const KIOSK_STATES = {
  IDLE: 'idle',
  PAYMENT: 'payment',
  CAPTURE: 'capture',
  REVIEW: 'review',
  PROCESSING: 'processing',
  REVEAL: 'reveal',
  RESET: 'reset',
} as const;

/** Photobooth-specific states. */
export const PHOTOBOOTH_STATES = {
  FRAME_SELECT: 'frame_select',
  ARRANGE: 'arrange',
  COMPOSITING: 'compositing',
  PHOTOBOOTH_REVEAL: 'photobooth_reveal',
} as const;

/** Frontend-only pseudo-state for feature selection. */
export const FEATURE_SELECT_STATE = 'feature_select' as const;

/** Default countdown duration in seconds before capture. */
export const COUNTDOWN_SECONDS = 3;

/** Default capture window time limit in seconds. */
export const DEFAULT_CAPTURE_TIME_LIMIT = 60;

/** Reveal screen display duration in seconds before auto-reset. */
export const REVEAL_DURATION_SECONDS = 15;

/** Processing screen message rotation interval in ms. */
export const PROCESSING_MESSAGE_INTERVAL_MS = 2500;

/** Default MJPEG stream URL. */
export const CAMERA_STREAM_URL = '/api/v1/camera/stream?resolution=1280x720&fps=15&quality=85';

/** Admin token storage key. */
export const ADMIN_TOKEN_KEY = 'vibeprint_admin_token';

/** Admin token expiry storage key. */
export const ADMIN_TOKEN_EXPIRY_KEY = 'vibeprint_admin_token_expiry';

/** Processing screen fun messages. */
export const PROCESSING_MESSAGES = [
  'Reading your vibe...',
  'Analyzing your aura...',
  'Consulting the vibe oracle...',
  'Decoding your energy field...',
  'Mixing your cosmic palette...',
  'Tuning into your frequency...',
  'Almost there...',
  'Scanning the aesthetic matrix...',
  'Distilling your essence...',
  'Channeling cosmic insights...',
] as const;
