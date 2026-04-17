import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAdminStore } from '@/stores/adminStore';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { LayoutDashboard, Settings, HardDrive, BarChart3, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';

const navItems = [
  { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
  { label: 'Configuration', path: '/admin/config', icon: Settings },
  { label: 'Hardware', path: '/admin/hardware', icon: HardDrive },
  { label: 'Analytics', path: '/admin/analytics', icon: BarChart3 },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const logout = useAdminStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  return (
    <div className="flex h-screen bg-surface-0">
      <aside className="w-56 border-r border-white/[0.06] flex flex-col">
        {/* Brand */}
        <div className="p-5 pb-4">
          <h1 className="text-lg font-display font-bold text-white">VibePrint OS</h1>
          <p className="text-xs text-white/35 mt-0.5">Admin Dashboard</p>
        </div>
        <Separator className="bg-white/[0.06]" />
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white/[0.06] text-white border-l-2 border-violet-500'
                    : 'text-white/45 hover:bg-white/[0.03] hover:text-white/70'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3">
          <Button variant="ghost" className="w-full justify-start gap-2 text-white/35 hover:text-white/70 hover:bg-white/[0.03]" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
