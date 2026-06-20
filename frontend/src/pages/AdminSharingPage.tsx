import SharingConfig from '@/components/admin/SharingConfig';

export default function AdminSharingPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 className="text-2xl font-display font-bold text-white">Sharing</h2>
        <p className="text-sm text-white/30" style={{ marginTop: '0.25rem' }}>
          Branding for the mobile landing page customers see when they scan the share QR code.
        </p>
      </div>
      <SharingConfig />
    </div>
  );
}
