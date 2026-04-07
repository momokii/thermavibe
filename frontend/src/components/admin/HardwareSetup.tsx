import { useQuery, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/api/adminApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatDuration, formatBytes } from '@/lib/formatters';
import { toast } from 'sonner';

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

  if (isLoading) return <p className="text-muted-foreground">Loading hardware status...</p>;

  return (
    <div className="space-y-4">
      {/* Camera */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Camera</CardTitle>
          <Badge variant={hw?.camera.connected ? 'default' : 'destructive'}>
            {hw?.camera.connected ? 'Connected' : 'Disconnected'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          {hw?.camera.active_device && (
            <p className="text-sm text-muted-foreground">
              {hw.camera.active_device.name} ({hw.camera.active_device.path})
            </p>
          )}
          <p className="text-sm">
            Status: {hw?.camera.status.streaming ? 'Streaming' : 'Idle'}
          </p>
          <Button size="sm" onClick={() => testCameraMut.mutate()} disabled={testCameraMut.isPending}>
            Test Camera
          </Button>
        </CardContent>
      </Card>

      {/* Printer */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Printer</CardTitle>
          <Badge variant={hw?.printer.connected ? 'default' : 'destructive'}>
            {hw?.printer.connected ? 'Connected' : 'Disconnected'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          {hw?.printer.device && (
            <p className="text-sm text-muted-foreground">
              {hw.printer.device.vendor} {hw.printer.device.model}
            </p>
          )}
          <p className="text-sm">
            Paper: {hw?.printer.status.paper_ok ? 'OK' : 'Low/Empty'} | 
            Prints today: {hw?.printer.status.total_prints_today ?? 0}
          </p>
          <Button size="sm" onClick={() => testPrinterMut.mutate()} disabled={testPrinterMut.isPending}>
            Test Print
          </Button>
        </CardContent>
      </Card>

      {/* System */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">System Resources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>CPU</span>
              <span>{hw?.system.cpu_usage_percent.toFixed(1)}%</span>
            </div>
            <Progress value={hw?.system.cpu_usage_percent ?? 0} />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>Memory</span>
              <span>{formatBytes((hw?.system.memory_usage_mb ?? 0) * 1024 * 1024)}</span>
            </div>
            <Progress value={Math.min((hw?.system.memory_usage_mb ?? 0) / 4096 * 100, 100)} />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>Disk</span>
              <span>{hw?.system.disk_usage_percent.toFixed(1)}%</span>
            </div>
            <Progress value={hw?.system.disk_usage_percent ?? 0} />
          </div>
          <p className="text-sm text-muted-foreground">
            Uptime: {formatDuration(hw?.system.uptime_seconds ?? 0)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
