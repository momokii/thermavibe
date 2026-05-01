import AccessCodeManager from '@/components/admin/AccessCodeManager';

export default function AdminAccessCodesPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 className="text-2xl font-display font-bold text-white">Access Codes</h2>
        <p className="text-sm text-white/30" style={{ marginTop: '0.25rem' }}>
          Manage access codes for event-hosted kiosk sessions. When enabled, replaces payment with code-based entry.
        </p>
      </div>
      <AccessCodeManager />
    </div>
  );
}
