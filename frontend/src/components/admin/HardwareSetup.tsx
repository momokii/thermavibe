import { useQuery, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/api/adminApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDuration, formatBytes } from '@/lib/formatters';
import { toast } from 'sonner';
import { Camera, Printer, Cpu, Wifi, WifiOff, Loader2 } from 'lucide-react';

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
      <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading hardware status...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Camera */}
      <Card className="bg-white/[0.03] border-white/[0.08] overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-violet-500 via-purple-500 to-pink-500" />
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-violet-400" />
            <CardTitle className="text-lg font-display">Camera</CardTitle>
          </div>
          <Badge
            variant={hw?.camera.connected ? 'default' : 'destructive'}
            className={hw?.camera.connected ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25' : ''}
          >
            {hw?.camera.connected ? (
              <span className="flex items-center gap-1"><Wifi className="h-3 w-3" /> Connected</span>
            ) : (
              <span className="flex items-center gap-1"><WifiOff className="h-3 w-3" /> Disconnected</span>
            )}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {hw?.camera.active_device && (
            <p className="text-sm text-muted-foreground">
              {hw.camera.active_device.name} ({hw.camera.active_device.path})
            </p>
          )}
          <p className="text-sm">
            Status: <span className={hw?.camera.status.streaming ? 'text-emerald-400' : 'text-muted-foreground'}>
              {hw?.camera.status.streaming ? 'Streaming' : 'Idle'}
            </span>
          </p>
          <Button
            size="sm"
            onClick={() => testCameraMut.mutate()}
            disabled={testCameraMut.isPending}
            className="bg-white/[0.06] hover:bg-white/[0.1] text-foreground border border-white/[0.08]"
            variant="outline"
          >
            {testCameraMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            Test Camera
          </Button>
        </CardContent>
      </Card>

      {/* Printer */}
      <Card className="bg-white/[0.03] border-white/[0.08] overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500" />
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Printer className="h-4 w-4 text-pink-400" />
            <CardTitle className="text-lg font-display">Printer</CardTitle>
          </div>
          <Badge
            variant={hw?.printer.connected ? 'default' : 'destructive'}
            className={hw?.printer.connected ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25' : ''}
          >
            {hw?.printer.connected ? (
              <span className="flex items-center gap-1"><Wifi className="h-3 w-3" /> Connected</span>
            ) : (
              <span className="flex items-center gap-1"><WifiOff className="h-3 w-3" /> Disconnected</span>
            )}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {hw?.printer.device && (
            <p className="text-sm text-muted-foreground">
              {hw.printer.device.vendor} {hw.printer.device.model}
            </p>
          )}
          <div className="text-sm space-x-1">
            <span>Paper:</span>
            <span className={hw?.printer.status.paper_ok ? 'text-emerald-400' : 'text-amber-400'}>
              {hw?.printer.status.paper_ok ? 'OK' : 'Low/Empty'}
            </span>
            <span className="text-muted-foreground">|</span>
            <span>Prints today: <span className="font-display tabular-nums">{hw?.printer.status.total_prints_today ?? 0}</span></span>
          </div>
          <Button
            size="sm"
            onClick={() => testPrinterMut.mutate()}
            disabled={testPrinterMut.isPending}
            className="bg-white/[0.06] hover:bg-white/[0.1] text-foreground border border-white/[0.08]"
            variant="outline"
          >
            {testPrinterMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            Test Print
          </Button>
        </CardContent>
      </Card>

      {/* System Resources */}
      <Card className="bg-white/[0.03] border-white/[0.08] overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500" />
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-cyan-400" />
            <CardTitle className="text-lg font-display">System Resources</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">CPU</span>
              <span className="font-display tabular-nums">{hw?.system.cpu_usage_percent.toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all duration-500"
                style={{ width: `${hw?.system.cpu_usage_percent ?? 0}%` }}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Memory</span>
              <span className="font-display tabular-nums">{formatBytes((hw?.system.memory_usage_mb ?? 0) * 1024 * 1024)}</span>
            </div>
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-pink-500 to-orange-500 transition-all duration-500"
                style={{ width: `${Math.min((hw?.system.memory_usage_mb ?? 0) / 4096 * 100, 100)}%` }}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Disk</span>
              <span className="font-display tabular-nums">{hw?.system.disk_usage_percent.toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all duration-500"
                style={{ width: `${hw?.system.disk_usage_percent ?? 0}%` }}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground pt-1">
            Uptime: <span className="font-display tabular-nums">{formatDuration(hw?.system.uptime_seconds ?? 0)}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
