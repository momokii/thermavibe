import PrintTemplateConfig from '@/components/admin/PrintTemplateConfig';

export default function AdminPrintTemplatePage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 className="text-2xl font-display font-bold text-white">Print Template</h2>
        <p className="text-sm text-white/30" style={{ marginTop: '0.25rem' }}>
          Configure receipt footer branding and timezone for all printed output.
        </p>
      </div>
      <PrintTemplateConfig />
    </div>
  );
}
