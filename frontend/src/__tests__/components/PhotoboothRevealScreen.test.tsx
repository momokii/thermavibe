import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PhotoboothRevealScreen from '@/components/kiosk/PhotoboothRevealScreen';
import { useKioskStore } from '@/stores/kioskStore';
import type { ShareResponse } from '@/api/types';

// Proxy-based framer-motion mock: renders any motion.X as the corresponding HTML tag.
vi.mock('framer-motion', () => {
  const motion = new Proxy({}, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get: (_target: Record<string, never>, tag: string) => {
      const htmlTag = tag.toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ({ children, ...props }: any) =>
        React.createElement(htmlTag, props, children);
    },
  });
  return {
    motion,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

// Mock QRCodeSVG so the encoded value is queryable in the DOM.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: any) => <div data-testid="qr-value">{value}</div>,
}));

// Mock usePhotoboothState — individual tests override via setMockShareData.
const photoboothStateMock = vi.hoisted(() => ({
  shareData: null as ShareResponse | null,
  shareError: null as string | null,
  isSharing: false,
  isPrinting: false,
  printError: null as string | null,
  printStrip: vi.fn(),
  getShareUrl: vi.fn(),
  finishPhotobooth: vi.fn(),
}));

vi.mock('@/hooks/usePhotoboothState', () => ({
  usePhotoboothState: () => photoboothStateMock,
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function setMockShareData(data: ShareResponse | null) {
  photoboothStateMock.shareData = data;
  photoboothStateMock.shareError = null;
  photoboothStateMock.isSharing = false;
}

describe('PhotoboothRevealScreen — QR URL handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useKioskStore.getState().reset();
    useKioskStore.getState().setSession('test-session', {
      id: 'test-session',
      state: 'reveal',
      payment_enabled: false,
      payment_status: null,
      captured_at: new Date().toISOString(),
      capture_image_url: null,
      analysis_text: null,
      analysis_provider: null,
      printed_at: null,
      print_success: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: null,
      photos: [],
      capture_time_limit: null,
    });
    photoboothStateMock.shareData = null;
    photoboothStateMock.shareError = null;
    photoboothStateMock.isSharing = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('prepends window.origin when qr_data is a relative path', () => {
    setMockShareData({
      share_url: '/api/v1/kiosk/share/abc',
      qr_data: '/api/v1/kiosk/share/abc',
      expires_in: 300,
    });
    renderWithProviders(<PhotoboothRevealScreen />);
    const qr = screen.getByTestId('qr-value');
    expect(qr.textContent).toBe(
      `${window.location.origin}/api/v1/kiosk/share/abc`,
    );
  });

  it('uses absolute qr_data verbatim when it starts with https://', () => {
    setMockShareData({
      share_url: 'https://kiosk.example.com/api/v1/kiosk/share/abc',
      qr_data: 'https://kiosk.example.com/api/v1/kiosk/share/abc',
      expires_in: 300,
    });
    renderWithProviders(<PhotoboothRevealScreen />);
    const qr = screen.getByTestId('qr-value');
    expect(qr.textContent).toBe(
      'https://kiosk.example.com/api/v1/kiosk/share/abc',
    );
    // Must NOT have origin prepended
    expect(qr.textContent).not.toContain(`${window.location.origin}//`);
  });

  it('uses absolute qr_data verbatim when it starts with http://', () => {
    setMockShareData({
      share_url: 'http://10.0.0.5:8000/api/v1/kiosk/share/abc',
      qr_data: 'http://10.0.0.5:8000/api/v1/kiosk/share/abc',
      expires_in: 300,
    });
    renderWithProviders(<PhotoboothRevealScreen />);
    const qr = screen.getByTestId('qr-value');
    expect(qr.textContent).toBe('http://10.0.0.5:8000/api/v1/kiosk/share/abc');
  });

  it('shows fallback message while shareData is loading', () => {
    setMockShareData(null);
    photoboothStateMock.isSharing = true;
    renderWithProviders(<PhotoboothRevealScreen />);
    expect(screen.getByText('Generating link...')).toBeInTheDocument();
  });
});
