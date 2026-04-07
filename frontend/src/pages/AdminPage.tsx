import { Navigate, Outlet } from 'react-router-dom';
import { useAdminStore } from '@/stores/adminStore';
import AdminLayout from '@/components/admin/AdminLayout';

export default function AdminPage() {
  const isAuthenticated = useAdminStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
