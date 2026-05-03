import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAdminStore } from '@/stores/adminStore';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { LayoutDashboard, HardDrive, BarChart3, Camera, ImageIcon, Sparkles, LogOut, Bot, CreditCard } from 'lucide-react';
import type { ReactNode } from 'react';

type NavItem = { label: string; path: string; icon: React.ComponentType<{ className?: string }> };
type NavSection = { heading?: string; items: NavItem[] };

const navSections: NavSection[] = [
  {
    items: [
      { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    ],
  },
  {
    heading: 'Configuration',
    items: [
      { label: 'AI Provider', path: '/admin/ai-provider', icon: Bot },
      { label: 'Payment & Access', path: '/admin/payment-access', icon: CreditCard },
      { label: 'Hardware', path: '/admin/hardware', icon: HardDrive },
    ],
  },
  {
    heading: 'Features',
    items: [
      { label: 'Vibe Check', path: '/admin/vibe-check', icon: Sparkles },
      { label: 'Photobooth', path: '/admin/photobooth', icon: Camera },
    ],
  },
  {
    heading: 'Data',
    items: [
      { label: 'Gallery', path: '/admin/strips', icon: ImageIcon },
      { label: 'Analytics', path: '/admin/analytics', icon: BarChart3 },
    ],
  },
];

/** Check interval for session expiry (every 60 seconds). */
const SESSION_CHECK_INTERVAL_MS = 60_000;

export default function AdminLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const logout = useAdminStore((s) => s.logout);
  const expiresAt = useAdminStore((s) => s.expiresAt);
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  // Proactive session expiry check
  useEffect(() => {
    const checkExpiry = () => {
      if (!expiresAt) return;
      const expiryMs = new Date(expiresAt).getTime();
      if (Date.now() >= expiryMs) {
        handleLogout();
      }
    };

    // Check immediately on mount
    checkExpiry();

    // Then check periodically
    timerRef.current = setInterval(checkExpiry, SESSION_CHECK_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [expiresAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // React to 401 events from the API client (expired/invalid token)
  useEffect(() => {
    const onUnauthorized = () => {
      handleLogout();
    };
    window.addEventListener('admin:unauthorized', onUnauthorized);
    return () => window.removeEventListener('admin:unauthorized', onUnauthorized);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen bg-surface-0">
      <aside style={{ width: '16rem' }} className="border-r border-white/[0.06] flex flex-col">
        {/* Brand */}
        <div style={{ padding: '1.5rem 1.25rem 1.25rem' }}>
          <h1 className="text-lg font-display font-bold text-white">VibePrint OS</h1>
          <p className="text-xs text-white/35" style={{ marginTop: '0.25rem' }}>Admin Dashboard</p>
        </div>
        <Separator className="bg-white/[0.06]" />
        <nav style={{ flex: 1, padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {navSections.map((section, sectionIdx) => (
            <div key={sectionIdx} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {section.heading && (
                <span
                  className="text-xs font-semibold text-white/25 uppercase tracking-wider px-3 pt-2"
                  style={{ paddingBottom: '0.25rem' }}
                >
                  {section.heading}
                </span>
              )}
              {section.items.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-white/[0.06] text-white border-l-2 border-violet-500'
                        : 'text-white/45 hover:bg-white/[0.03] hover:text-white/70'
                    }`}
                    style={{ padding: '0.75rem' }}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div style={{ padding: '0.75rem 0.75rem 1.5rem' }}>
          <Button variant="ghost" className="w-full justify-start gap-2 text-white/35 hover:text-white/70 hover:bg-white/[0.03]" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto" style={{ padding: '2.5rem' }}>{children}</main>
    </div>
  );
}
