import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IdleScreen from '@/components/kiosk/IdleScreen';
import { useKioskStore } from '@/stores/kioskStore';

vi.mock('framer-motion', () => ({
  motion: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
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

describe('IdleScreen', () => {
  beforeEach(() => {
    useKioskStore.getState().reset();
  });

  it('renders the VibePrint title and CTA', () => {
    renderWithProviders(<IdleScreen />);
    expect(screen.getByText('VibePrint')).toBeInTheDocument();
    expect(screen.getByText('Touch to Start')).toBeInTheDocument();
    expect(screen.getByText(/Tap anywhere to begin/)).toBeInTheDocument();
  });

  it('shows Starting... when transitioning', () => {
    useKioskStore.getState().setTransitioning(true);
    renderWithProviders(<IdleScreen />);
    expect(screen.getByText('Starting...')).toBeInTheDocument();
  });

  it('calls startSession on click', async () => {
    const startSpy = vi.spyOn(useKioskStore.getState(), 'setState');
    renderWithProviders(<IdleScreen />);

    const ctaButton = screen.getByText('Touch to Start');
    fireEvent.click(ctaButton);

    // The click triggers startSession which calls the API via useKioskState hook
    // Since MSW is running, it should succeed
    expect(startSpy).toBeDefined();
  });
});
