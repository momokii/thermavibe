import { create } from 'zustand';
import type { ConfigAllResponse, HardwareStatusResponse } from '@/api/types';
import { ADMIN_TOKEN_KEY, ADMIN_TOKEN_EXPIRY_KEY } from '@/lib/constants';

interface AdminStore {
  token: string | null;
  isAuthenticated: boolean;
  expiresAt: string | null;
  config: ConfigAllResponse | null;
  hardwareStatus: HardwareStatusResponse | null;
  activeTab: string;
  isLoading: boolean;

  setToken: (token: string, expiresAt: string) => void;
  logout: () => void;
  setConfig: (config: ConfigAllResponse) => void;
  setHardwareStatus: (status: HardwareStatusResponse) => void;
  setActiveTab: (tab: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useAdminStore = create<AdminStore>((set) => ({
  token: localStorage.getItem(ADMIN_TOKEN_KEY),
  isAuthenticated: !!localStorage.getItem(ADMIN_TOKEN_KEY),
  expiresAt: localStorage.getItem(ADMIN_TOKEN_EXPIRY_KEY),
  config: null,
  hardwareStatus: null,
  activeTab: 'dashboard',
  isLoading: false,

  setToken: (token, expiresAt) => {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    localStorage.setItem(ADMIN_TOKEN_EXPIRY_KEY, expiresAt);
    set({ token, isAuthenticated: true, expiresAt });
  },

  logout: () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_TOKEN_EXPIRY_KEY);
    set({ token: null, isAuthenticated: false, expiresAt: null, config: null });
  },

  setConfig: (config) => set({ config }),
  setHardwareStatus: (hardwareStatus) => set({ hardwareStatus }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setLoading: (isLoading) => set({ isLoading }),
}));
