import PhotoboothConfig from '@/components/admin/PhotoboothConfig';
import ThemeManager from '@/components/admin/ThemeManager';

export default function AdminPhotoboothPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 className="text-2xl font-display font-bold text-white">Photobooth</h2>
        <p className="text-sm text-white/30" style={{ marginTop: '0.25rem' }}>
          Configure photobooth settings and manage strip themes.
        </p>
      </div>
      <PhotoboothConfig />
      <ThemeManager />
    </div>
  );
}
