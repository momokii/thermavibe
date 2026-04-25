/**
 * TypeScript type definitions matching backend Pydantic schemas.
 * All API request/response types are defined here.
 */

// --- Enums ---

export type KioskState =
  | 'idle'
  | 'payment'
  | 'capture'
  | 'review'
  | 'processing'
  | 'reveal'
  | 'frame_select'
  | 'arrange'
  | 'compositing'
  | 'photobooth_reveal'
  | 'feature_select'
  | 'reset';

export type PaymentStatusValue = 'none' | 'pending' | 'confirmed' | 'expired' | 'denied' | 'refunded';

export type SessionType = 'vibe_check' | 'photobooth';

// --- Kiosk ---

export interface PhotoEntry {
  photo_url: string;
  captured_at: string;
}

export interface SnapResponse {
  id: string;
  state: KioskState;
  photos: PhotoEntry[];
  photo_url: string;
  photo_index: number;
  time_remaining_seconds: number;
}

export interface SelectRequest {
  photo_index: number;
}

export interface SessionCreateRequest {
  payment_enabled: boolean;
  session_type?: SessionType;
}

export interface SessionResponse {
  id: string;
  state: KioskState;
  session_type?: SessionType;
  payment_enabled: boolean;
  payment_status: PaymentStatusValue | null;
  captured_at: string | null;
  capture_image_url: string | null;
  analysis_text: string | null;
  analysis_provider: string | null;
  printed_at: string | null;
  print_success: boolean | null;
  created_at: string;
  updated_at: string | null;
  expires_at: string | null;
  photos: PhotoEntry[];
  capture_time_limit: number | null;
  photobooth_layout?: PhotoboothLayout | null;
  composite_image_url?: string | null;
}

export interface CaptureResponse {
  id: string;
  state: KioskState;
  payment_enabled: boolean;
  payment_status: PaymentStatusValue | null;
  captured_at: string | null;
  capture_image_url: string | null;
  analysis_text: string | null;
  analysis_provider: string | null;
  printed_at: string | null;
  created_at: string;
  updated_at: string | null;
  expires_at: string | null;
}

export interface SessionFinishResponse {
  id: string;
  state: KioskState;
  message: string;
  duration_seconds: number;
}

// --- Camera ---

export interface ResolutionInfo {
  width: number;
  height: number;
  format: string;
}

export interface CameraDevice {
  index: number;
  name: string;
  path: string;
  resolutions: ResolutionInfo[];
  is_active: boolean;
}

export interface CameraListResponse {
  devices: CameraDevice[];
}

export interface CameraSelectRequest {
  device_index: number;
}

export interface ActiveCameraInfo {
  index: number;
  name: string;
  path: string;
}

export interface CameraSelectResponse {
  message: string;
  active_device: ActiveCameraInfo;
}

// --- AI ---

export interface TokenUsage {
  input: number;
  output: number;
}

export interface AIAnalyzeResponse {
  analysis_text: string;
  provider: string;
  model: string;
  latency_ms: number;
  tokens_used: TokenUsage | null;
}

// --- Payment ---

export interface CreateQRRequest {
  session_id: string;
  amount: number;
  currency: string;
}

export interface CreateQRResponse {
  payment_id: string;
  session_id: string;
  provider: string;
  amount: number;
  currency: string;
  status: string;
  qr_code_url: string;
  qr_string: string;
  expires_at: string | null;
  created_at: string;
}

export interface PaymentStatusResponse {
  payment_id: string;
  session_id: string;
  provider: string;
  amount: number;
  currency: string;
  status: string;
  paid_at: string | null;
  expires_at: string | null;
  created_at: string;
}

// --- Print ---

export interface PrintJobRequest {
  include_photo: boolean;
}

export interface PrinterInfo {
  vendor: string;
  model: string;
  vendor_id: string;
  product_id: string;
}

export interface PrintHardwareStatus {
  paper_ok: boolean;
  printer_online: boolean;
  errors: string[];
}

export interface PrintTestResponse {
  success: boolean;
  message: string;
  printer_info: PrinterInfo | null;
}

export interface PrintStatusResponse {
  connected: boolean;
  printer: PrinterInfo | null;
  status: PrintHardwareStatus | null;
  last_print_at: string | null;
  total_prints_today: number;
}

// --- Admin Auth ---

export interface LoginRequest {
  pin: string;
}

export interface LoginResponse {
  token: string;
  token_type: string;
  expires_in: number;
  expires_at: string;
}

// --- Admin Config ---

export interface ConfigAllResponse {
  categories: Record<string, Record<string, unknown>>;
}

export interface ConfigUpdateResponse {
  category: string;
  updated_fields: Record<string, unknown>;
  all_values: Record<string, unknown>;
}

// --- Admin Analytics ---

export interface SessionAnalyticsSummary {
  total_sessions: number;
  completed_sessions: number;
  abandoned_sessions: number;
  completion_rate: number;
  avg_duration_seconds: number;
}

export interface SessionTimeseriesPoint {
  period: string;
  sessions: number;
  completed: number;
  abandoned: number;
  avg_duration_seconds: number;
}

export interface SessionAnalyticsResponse {
  summary: SessionAnalyticsSummary;
  state_distribution: Record<string, number>;
  timeseries: SessionTimeseriesPoint[];
  page: number;
  per_page: number;
  total_periods: number;
}

export interface RevenueAnalyticsSummary {
  total_revenue: number;
  total_transactions: number;
  avg_transaction_amount: number;
  currency: string;
  refund_count: number;
  refund_total: number;
}

export interface RevenueTimeseriesPoint {
  period: string;
  revenue: number;
  transactions: number;
  refunds: number;
}

export interface ProviderRevenueStats {
  transactions: number;
  revenue: number;
  success_rate: number;
}

export interface RevenueAnalyticsResponse {
  summary: RevenueAnalyticsSummary;
  timeseries: RevenueTimeseriesPoint[];
  by_provider: Record<string, ProviderRevenueStats>;
}

// --- Admin Hardware ---

export interface CameraDeviceInfo {
  index: number;
  name: string;
  path: string;
}

export interface CameraStatusDetail {
  streaming: boolean;
  last_capture_at: string | null;
  errors: string[];
}

export interface ActiveCameraStatus {
  connected: boolean;
  active_device: CameraDeviceInfo | null;
  status: CameraStatusDetail;
}

export interface PrinterDeviceInfo {
  vendor: string;
  model: string;
  usb_path: string;
  vendor_id: string;
  product_id: string;
}

export interface PrinterStatusDetail {
  paper_ok: boolean;
  printer_online: boolean;
  last_print_at: string | null;
  total_prints_today: number;
  errors: string[];
}

export interface PrinterHardwareStatus {
  connected: boolean;
  device: PrinterDeviceInfo | null;
  status: PrinterStatusDetail;
}

export interface SystemResources {
  cpu_usage_percent: number;
  memory_usage_mb: number;
  disk_usage_percent: number;
  uptime_seconds: number;
}

export interface HardwareStatusResponse {
  camera: ActiveCameraStatus;
  printer: PrinterHardwareStatus;
  system: SystemResources;
}

// --- Common ---

export interface ErrorResponse {
  code: string;
  message: string;
  request_id: string | null;
}

export interface ErrorEnvelope {
  error: ErrorResponse;
}

export interface SuccessMessage {
  message: string;
}

// --- Photobooth ---

export interface PhotoboothLayout {
  theme_id?: number;
  theme_name?: string;
  layout_rows: number;
  photo_assignments?: Record<string, number>;
}

export interface PhotoboothSnapResponse {
  id: string;
  state: KioskState;
  photo_url: string;
  photo_index: number;
  total_photos: number;
  time_remaining_seconds: number;
}

export interface FrameSelectRequest {
  theme_id: number;
  layout_rows: number;
}

export interface ArrangeRequest {
  photo_assignments: Record<number, number>;
}

export interface ShareResponse {
  share_url: string;
  expires_in: number;
  qr_data: string;
}

export interface FeaturesResponse {
  vibe_check_enabled: boolean;
  photobooth_enabled: boolean;
  photobooth_max_photos: number;
  photobooth_min_photos: number;
}

// --- Theme ---

export interface BackgroundConfig {
  type: 'solid' | 'gradient';
  color: string;
  gradient_start?: string;
  gradient_end?: string;
}

export interface PhotoSlotConfig {
  border_width: number;
  border_color: string;
  border_radius: number;
  padding: number;
  shadow: boolean;
}

export interface ThemeConfig {
  background: BackgroundConfig;
  photo_slot: PhotoSlotConfig;
  decorations: {
    top_banner: boolean;
    banner_text: string;
    divider_style: 'line' | 'dotted' | 'none';
    divider_color: string;
    date_format: string;
  };
  font: {
    family: string;
    color: string;
    size: number;
  };
  watermark: {
    enabled: boolean;
    text: string;
    position: string;
    opacity: number;
  };
}

export interface ThemeResponse {
  id: number;
  name: string;
  display_name: string;
  config: ThemeConfig;
  preview_image_url: string | null;
  is_builtin: boolean;
  is_enabled: boolean;
  is_default: boolean;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface ThemeCreateRequest {
  name: string;
  display_name: string;
  config: ThemeConfig;
}

export interface ThemeUpdateRequest {
  display_name?: string;
  config?: ThemeConfig;
  sort_order?: number;
}
