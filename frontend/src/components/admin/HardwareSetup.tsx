import { useQuery, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/api/adminApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDuration, formatBytes } from '@/lib/formatters';
import { toast } from 'sonner';
import { Camera, Printer, Cpu, Loader2 } from 'lucide-react';

export default function HardwareSetup() {
  const { data: hw, isLoading } = useQuery({
    queryKey: ['hardware'],
    queryFn: () => adminApi.getHardwareStatus().then((r) => r.data),
    refetchInterval: 10000,
  });

  const testCameraMut = useMutation({
    mutationFn: () => adminApi.testCamera(),
    onSuccess: () => toast.success('Camera test completed'),
    onError: () => toast.error('Camera test failed'),
  });

  const testPrinterMut = useMutation({
    mutationFn: () => adminApi.testPrinter(),
    onSuccess: () => toast.success('Test print sent'),
    onError: () => toast.error('Print test failed'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-white/40">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading hardware status...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Camera */}
      <Card className="card-surface border-0">
        <CardHeader className="flex flex-row items-center justify-between" style={{ padding: '1.5rem' }}>
          <div className="flex items-center gap-2.5">
            <Camera className="h-4 w-4 text-violet-400" />
            <CardTitle className="text-base font-display text-white">Camera</CardTitle>
          </div>
          <Badge
            className={hw?.camera.connected
              ? 'bg-emerald-500/20 text-emerald-300 border-0'
              : 'bg-red-500/20 text-red-300 border-0'}
          >
            {hw?.camera.connected ? 'Connected' : 'Disconnected'}
          </Badge>
        </CardHeader>
        <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0 1.5rem 1.5rem' }}>
          {hw?.camera.active_device && (
            <p className="text-sm text-white/40">
              {hw.camera.active_device.name} ({hw.camera.active_device.path})
            </p>
          )}
          <p className="text-sm text-white/60">
            Status: <span className={hw?.camera.status.streaming ? 'text-emerald-400' : 'text-white/40'}>
              {hw?.camera.status.streaming ? 'Streaming' : 'Idle'}
            </span>
          </p>
          <Button
            size="sm"
            onClick={() => testCameraMut.mutate()}
            disabled={testCameraMut.isPending}
            className="btn-secondary border-0 text-sm"
          >
            {testCameraMut.isPending ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : null}
            Test Camera
          </Button>
        </CardContent>
      </Card>

      {/* Printer */}
      <Card className="card-surface border-0">
        <CardHeader className="flex flex-row items-center justify-between" style={{ padding: '1.5rem' }}>
          <div className="flex items-center gap-2.5">
            <Printer className="h-4 w-4 text-violet-400" />
            <CardTitle className="text-base font-display text-white">Printer</CardTitle>
          </div>
          <Badge
            className={hw?.printer.connected
              ? 'bg-emerald-500/20 text-emerald-300 border-0'
              : 'bg-red-500/20 text-red-300 border-0'}
          >
            {hw?.printer.connected ? 'Connected' : 'Disconnected'}
          </Badge>
        </CardHeader>
        <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0 1.5rem 1.5rem' }}>
          {hw?.printer.device && (
            <p className="text-sm text-white/40">
              {hw.printer.device.vendor} {hw.printer.device.model}
            </p>
          )}
          <div className="text-sm text-white/60">
            Paper: <span className={hw?.printer.status.paper_ok ? 'text-emerald-400' : 'text-amber-400'}>
              {hw?.printer.status.paper_ok ? 'OK' : 'Low/Empty'}
            </span>
            <span className="text-white/25 mx-1">|</span>
            Prints today: <span className="font-display tabular-nums">{hw?.printer.status.total_prints_today ?? 0}</span>
          </div>
          <Button
            size="sm"
            onClick={() => testPrinterMut.mutate()}
            disabled={testPrinterMut.isPending}
            className="btn-secondary border-0 text-sm"
          >
            {testPrinterMut.isPending ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : null}
            Test Print
          </Button>
        </CardContent>
      </Card>

      {/* System Resources */}
      <Card className="card-surface border-0">
        <CardHeader style={{ padding: '1.5rem' }}>
          <div className="flex items-center gap-2.5">
            <Cpu className="h-4 w-4 text-violet-400" />
            <CardTitle className="text-base font-display text-white">System Resources</CardTitle>
          </div>
        </CardHeader>
        <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0 1.5rem 1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div className="flex justify-between text-sm">
              <span className="text-white/40">CPU</span>
              <span className="font-display tabular-nums text-white/70">{hw?.system.cpu_usage_percent.toFixed(1)}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${hw?.system.cpu_usage_percent ?? 0}%`,
                  background: (hw?.system.cpu_usage_percent ?? 0) > 85 ? '#ef4444' : (hw?.system.cpu_usage_percent ?? 0) > 60 ? '#f59e0b' : '#8b5cf6',
                }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div className="flex justify-between text-sm">
              <span className="text-white/40">Memory</span>
              <span className="font-display tabular-nums text-white/70">{formatBytes((hw?.system.memory_usage_mb ?? 0) * 1024 * 1024)}</span>
            </div>
            <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min((hw?.system.memory_usage_mb ?? 0) / 4096 * 100, 100)}%`,
                  background: Math.min((hw?.system.memory_usage_mb ?? 0) / 4096 * 100, 100) > 85 ? '#ef4444' : Math.min((hw?.system.memory_usage_mb ?? 0) / 4096 * 100, 100) > 60 ? '#f59e0b' : '#8b5cf6',
                }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div className="flex justify-between text-sm">
              <span className="text-white/40">Disk</span>
              <span className="font-display tabular-nums text-white/70">{hw?.system.disk_usage_percent.toFixed(1)}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${hw?.system.disk_usage_percent ?? 0}%`,
                  background: (hw?.system.disk_usage_percent ?? 0) > 85 ? '#ef4444' : (hw?.system.disk_usage_percent ?? 0) > 60 ? '#f59e0b' : '#8b5cf6',
                }}
              />
            </div>
          </div>
          <p className="text-sm text-white/35" style={{ paddingTop: '0.5rem' }}>
            Uptime: <span className="font-display tabular-nums text-white/50">{formatDuration(hw?.system.uptime_seconds ?? 0)}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
