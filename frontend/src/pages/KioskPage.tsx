import KioskShell from '@/components/kiosk/KioskShell';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function KioskPage() {
  return (
    <div className="kiosk-fullscreen">
      <ErrorBoundary>
        <KioskShell />
      </ErrorBoundary>
    </div>
  );
}
