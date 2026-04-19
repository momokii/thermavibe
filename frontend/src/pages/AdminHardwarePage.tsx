import HardwareSetup from '@/components/admin/HardwareSetup';

export default function AdminHardwarePage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <h2 className="text-2xl font-display font-bold text-white">Hardware</h2>
      <HardwareSetup />
    </div>
  );
}
