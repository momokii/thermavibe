import { useState } from 'react';
import AiConfig from '@/components/admin/AiConfig';
import PaymentAccessConfig from '@/components/admin/PaymentAccessConfig';

type ConfigTab = 'ai' | 'payment_access';

export default function AdminConfigPage() {
  const [tab, setTab] = useState<ConfigTab>('ai');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 className="text-2xl font-display font-bold text-white">Configuration</h2>
        <p className="text-sm text-white/30" style={{ marginTop: '0.25rem' }}>
          Manage AI provider, payment, and access settings.
        </p>
      </div>
      <div
        className="flex gap-1 rounded-lg bg-white/[0.03] border border-white/[0.06]"
        style={{ padding: '0.25rem', width: 'fit-content' }}
      >
        <button
          type="button"
          onClick={() => setTab('ai')}
          className={`rounded-md text-sm font-medium transition-colors ${
            tab === 'ai'
              ? 'bg-white/[0.08] text-violet-400'
              : 'text-white/40 hover:text-white/60'
          }`}
          style={{ padding: '0.5rem 1.25rem' }}
        >
          AI Provider
        </button>
        <button
          type="button"
          onClick={() => setTab('payment_access')}
          className={`rounded-md text-sm font-medium transition-colors ${
            tab === 'payment_access'
              ? 'bg-white/[0.08] text-violet-400'
              : 'text-white/40 hover:text-white/60'
          }`}
          style={{ padding: '0.5rem 1.25rem' }}
        >
          Payment & Access
        </button>
      </div>
      <div>
        {tab === 'ai' && <AiConfig />}
        {tab === 'payment_access' && <PaymentAccessConfig />}
      </div>
    </div>
  );
}
