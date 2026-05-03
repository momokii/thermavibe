import { Link, useLocation } from 'react-router-dom';
import { Home, LayoutDashboard } from 'lucide-react';

export default function NotFoundPage() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  return (
    <div className="flex flex-col items-center justify-center h-full w-full py-24">
      <h1 className="text-8xl font-display font-bold text-white/10 mb-6">404</h1>
      
      <h2 className="text-xl font-semibold text-white mb-4">Page Not Found</h2>
      
      <p className="text-white/35 text-sm mb-10 text-center max-w-xs">
        {isAdminRoute
          ? "This admin page doesn't exist. Check the sidebar for available pages."
          : "The page you're looking for doesn't exist."}
      </p>
      
      <Link
        to={isAdminRoute ? "/admin" : "/"}
        className="flex items-center justify-center w-52 h-11 mt-18 gap-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
      >
        {isAdminRoute ? (
          <>
            <LayoutDashboard className="h-4 w-4" />
            Back to Dashboard
          </>
        ) : (
          <>
            <Home className="h-4 w-4" />
            Back to Kiosk
          </>
        )}
      </Link>
    </div>
  );
}
