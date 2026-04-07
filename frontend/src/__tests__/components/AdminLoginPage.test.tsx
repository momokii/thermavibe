import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import AdminLoginPage from '@/pages/AdminLoginPage';
import { useAdminStore } from '@/stores/adminStore';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminLoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
    useAdminStore.getState().logout();
  });

  it('renders PIN input and submit button', () => {
    renderWithProviders(<AdminLoginPage />);
    expect(screen.getByLabelText('PIN Code')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  it('disables submit when PIN is less than 4 digits', () => {
    renderWithProviders(<AdminLoginPage />);
    const input = screen.getByLabelText('PIN Code');
    const button = screen.getByText('Sign In');

    fireEvent.change(input, { target: { value: '12' } });
    expect(button).toBeDisabled();
  });

  it('enables submit when PIN is 4+ digits', () => {
    renderWithProviders(<AdminLoginPage />);
    const input = screen.getByLabelText('PIN Code');
    const button = screen.getByText('Sign In');

    fireEvent.change(input, { target: { value: '1234' } });
    expect(button).toBeEnabled();
  });

  it('only allows numeric input', () => {
    renderWithProviders(<AdminLoginPage />);
    const input = screen.getByLabelText('PIN Code') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '12ab34' } });
    expect(input.value).toBe('1234');
  });

  it('shows error on invalid PIN', async () => {
    renderWithProviders(<AdminLoginPage />);
    const input = screen.getByLabelText('PIN Code');

    fireEvent.change(input, { target: { value: '0000' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Invalid PIN. Please try again.')).toBeInTheDocument();
    });
  });

  it('stores token on successful login', async () => {
    renderWithProviders(<AdminLoginPage />);
    const input = screen.getByLabelText('PIN Code');

    fireEvent.change(input, { target: { value: '1234' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(useAdminStore.getState().isAuthenticated).toBe(true);
      expect(useAdminStore.getState().token).toBe('test-jwt-token');
    });
  });
});
