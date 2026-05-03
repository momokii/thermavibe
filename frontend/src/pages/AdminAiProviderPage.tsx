import AiConfig from '@/components/admin/AiConfig';

export default function AdminAiProviderPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 className="text-2xl font-display font-bold text-white">AI Provider</h2>
        <p className="text-sm text-white/30" style={{ marginTop: '0.25rem' }}>
          Configure the AI provider and model settings used for analysis.
        </p>
      </div>
      <AiConfig />
    </div>
  );
}
