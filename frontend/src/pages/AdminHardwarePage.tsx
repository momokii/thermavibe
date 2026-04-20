import HardwareSetup from '@/components/admin/HardwareSetup';

export default function AdminHardwarePage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 className="text-2xl font-display font-bold text-white">Hardware</h2>
        <p className="text-sm text-white/30" style={{ marginTop: '0.25rem' }}>
          Camera, printer, and system status. Manage connected devices and test hardware.
        </p>
      </div>
      <HardwareSetup />
    </div>
  );
}
