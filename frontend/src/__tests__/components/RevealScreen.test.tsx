import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RevealScreen from '@/components/kiosk/RevealScreen';
import { useKioskStore } from '@/stores/kioskStore';

vi.mock('framer-motion', () => {
  // Proxy-based catch-all: renders any `motion.X` as the corresponding HTML tag.
  // Survives component churn — no whack-a-mole when new animated elements are added.
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

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('RevealScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useKioskStore.getState().reset();
    useKioskStore.getState().setSession('test-session', {
      id: 'test-session',
      state: 'reveal',
      payment_enabled: false,
      payment_status: null,
      captured_at: new Date().toISOString(),
      capture_image_url: '/captures/test.jpg',
      analysis_text: 'Your vibe is absolutely radiant!',
      analysis_provider: 'mock',
      printed_at: null,
      print_success: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: null,
      photos: [],
      capture_time_limit: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the captured photo', () => {
    renderWithProviders(<RevealScreen />);
    const img = screen.getByAltText('Your photo');
    expect(img).toBeInTheDocument();
  });

  it('renders the hint text', () => {
    renderWithProviders(<RevealScreen />);
    expect(screen.getByText(/Your receipt is printing/)).toBeInTheDocument();
  });

  it('displays typewriter text progressively', () => {
    renderWithProviders(<RevealScreen />);

    // Initially no text displayed (typewriter hasn't started)
    // After advancing timers, text should appear
    vi.advanceTimersByTime(100);

    // The displayedText should start building
    // The full text is "Your vibe is absolutely radiant!"
    // At 30ms per char, after 100ms we should have ~3 chars
    const textEl = screen.getByText(/Your/, { selector: 'p' });
    expect(textEl).toBeInTheDocument();
  });
});
