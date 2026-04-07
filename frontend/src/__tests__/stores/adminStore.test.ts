import { describe, it, expect, beforeEach } from 'vitest';
import { useAdminStore } from '@/stores/adminStore';
import { ADMIN_TOKEN_KEY, ADMIN_TOKEN_EXPIRY_KEY } from '@/lib/constants';

describe('adminStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAdminStore.getState().logout();
  });

  it('starts unauthenticated when no token in localStorage', () => {
    const { token, isAuthenticated } = useAdminStore.getState();
    expect(token).toBeNull();
    expect(isAuthenticated).toBe(false);
  });

  it('setToken stores token in localStorage and sets authenticated', () => {
    const expiresAt = '2025-12-31T23:59:59Z';
    useAdminStore.getState().setToken('jwt-token-123', expiresAt);

    const { token, isAuthenticated, expiresAt: storedExpiry } =
      useAdminStore.getState();
    expect(token).toBe('jwt-token-123');
    expect(isAuthenticated).toBe(true);
    expect(storedExpiry).toBe(expiresAt);
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBe('jwt-token-123');
    expect(localStorage.getItem(ADMIN_TOKEN_EXPIRY_KEY)).toBe(expiresAt);
  });

  it('logout clears token and localStorage', () => {
    useAdminStore.getState().setToken('jwt-token-456', '2025-12-31T23:59:59Z');
    useAdminStore.getState().setActiveTab('config');

    useAdminStore.getState().logout();

    const { token, isAuthenticated, config } = useAdminStore.getState();
    expect(token).toBeNull();
    expect(isAuthenticated).toBe(false);
    expect(config).toBeNull();
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(ADMIN_TOKEN_EXPIRY_KEY)).toBeNull();
  });

  it('manages active tab', () => {
    useAdminStore.getState().setActiveTab('dashboard');
    expect(useAdminStore.getState().activeTab).toBe('dashboard');

    useAdminStore.getState().setActiveTab('config');
    expect(useAdminStore.getState().activeTab).toBe('config');

    useAdminStore.getState().setActiveTab('analytics');
    expect(useAdminStore.getState().activeTab).toBe('analytics');
  });

  it('manages loading state', () => {
    expect(useAdminStore.getState().isLoading).toBe(false);

    useAdminStore.getState().setLoading(true);
    expect(useAdminStore.getState().isLoading).toBe(true);
  });

  it('stores config', () => {
    const mockConfig = {
      categories: {
        ai: { provider: 'mock' },
        payment: { enabled: false },
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useAdminStore.getState().setConfig(mockConfig as any);
    expect(useAdminStore.getState().config).toEqual(mockConfig);
  });
});
