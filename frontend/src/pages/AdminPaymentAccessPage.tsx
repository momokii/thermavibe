import PaymentAccessConfig from '@/components/admin/PaymentAccessConfig';

export default function AdminPaymentAccessPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 className="text-2xl font-display font-bold text-white">Payment & Access</h2>
        <p className="text-sm text-white/30" style={{ marginTop: '0.25rem' }}>
          Configure how users gain access to kiosk sessions — payment, access codes, or free entry.
        </p>
      </div>
      <PaymentAccessConfig />
    </div>
  );
}
