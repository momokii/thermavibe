import VibeCheckConfig from '@/components/admin/VibeCheckConfig';

export default function AdminVibeCheckPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 className="text-2xl font-display font-bold text-white">Vibe Check</h2>
        <p className="text-sm text-white/30" style={{ marginTop: '0.25rem' }}>
          Configure vibe check settings and AI analysis prompt.
        </p>
      </div>
      <VibeCheckConfig />
    </div>
  );
}
