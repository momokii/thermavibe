import HardwareSetup from '@/components/admin/HardwareSetup';

export default function AdminHardwarePage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-display font-bold text-gradient-primary">Hardware</h2>
      <HardwareSetup />
    </div>
  );
}
