import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CaptureScreen from '@/components/kiosk/CaptureScreen';
import { useKioskStore } from '@/stores/kioskStore';

vi.mock('framer-motion', () => ({
  motion: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('CaptureScreen', () => {
  beforeEach(() => {
    useKioskStore.getState().reset();
    useKioskStore.getState().setSession('test-session', {
      id: 'test-session',
      state: 'capture',
      payment_enabled: false,
      payment_status: null,
      captured_at: null,
      capture_image_url: null,
      analysis_text: null,
      analysis_provider: null,
      printed_at: null,
      print_success: null,
      created_at: new Date().toISOString(),
      updated_at: null,
      expires_at: null,
    });
  });

  it('renders camera feed image', () => {
    renderWithProviders(<CaptureScreen />);
    const img = screen.getByAltText('Camera feed');
    expect(img).toBeInTheDocument();
  });

  it('shows Get Ready! overlay initially', () => {
    renderWithProviders(<CaptureScreen />);
    expect(screen.getByText('Get Ready!')).toBeInTheDocument();
  });
});
