import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import KioskPage from '@/pages/KioskPage';
import AdminLoginPage from '@/pages/AdminLoginPage';
import AdminPage from '@/pages/AdminPage';
import AdminDashboardPage from '@/pages/AdminDashboardPage';
import AdminAiProviderPage from '@/pages/AdminAiProviderPage';
import AdminPaymentAccessPage from '@/pages/AdminPaymentAccessPage';
import AdminHardwarePage from '@/pages/AdminHardwarePage';
import AdminAnalyticsPage from '@/pages/AdminAnalyticsPage';
import AdminPhotoboothPage from '@/pages/AdminPhotoboothPage';
import AdminVibeCheckPage from '@/pages/AdminVibeCheckPage';
import AdminStripsGalleryPage from '@/pages/AdminStripsGalleryPage';
import AdminPrintTemplatePage from '@/pages/AdminPrintTemplatePage';
import AdminSharingPage from '@/pages/AdminSharingPage';
import NotFoundPage from '@/pages/NotFoundPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster position="top-center" richColors />
        <Routes>
          <Route path="/" element={<KioskPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminPage />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="ai-provider" element={<AdminAiProviderPage />} />
            <Route path="payment-access" element={<AdminPaymentAccessPage />} />
            <Route path="hardware" element={<AdminHardwarePage />} />
            <Route path="print-template" element={<AdminPrintTemplatePage />} />
            <Route path="sharing" element={<AdminSharingPage />} />
            <Route path="vibe-check" element={<AdminVibeCheckPage />} />
            <Route path="photobooth" element={<AdminPhotoboothPage />} />
            <Route path="strips" element={<AdminStripsGalleryPage />} />
            <Route path="analytics" element={<AdminAnalyticsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
