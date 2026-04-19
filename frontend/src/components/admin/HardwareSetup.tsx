import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api/adminApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatDuration, formatBytes } from '@/lib/formatters';
import { toast } from 'sonner';
import { Camera, Printer, Cpu, Loader2, RefreshCw } from 'lucide-react';
import { CAMERA_STREAM_URL } from '@/lib/constants';

export default function HardwareSetup() {
  const queryClient = useQueryClient();
  const [showPreview, setShowPreview] = useState(false);

  const { data: hw, isLoading } = useQuery({
    queryKey: ['hardware'],
    queryFn: () => adminApi.getHardwareStatus().then((r) => r.data),
    refetchInterval: 10000,
  });

  const { data: cameras, isLoading: camerasLoading } = useQuery({
    queryKey: ['cameras'],
    queryFn: () => adminApi.listCameras().then((r) => r.data),
  });

  const selectCameraMut = useMutation({
    mutationFn: (deviceIndex: number) => adminApi.selectCamera(deviceIndex),
    onSuccess: (response) => {
      toast.success(`Switched to ${response.data.active_device.name}`);
      queryClient.invalidateQueries({ queryKey: ['cameras'] });
      queryClient.invalidateQueries({ queryKey: ['hardware'] });
    },
    onError: () => toast.error('Failed to switch camera'),
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

  const activeCamera = cameras?.devices.find((d) => d.is_active);
  const detectedDevices = cameras?.devices.filter((d) => d.name && !d.name.includes('Camera ') || d.resolutions.length > 0) ?? [];

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
          <div className="flex items-center gap-2">
            <Badge
              className={hw?.camera.connected
                ? 'bg-emerald-500/20 text-emerald-300 border-0'
                : 'bg-red-500/20 text-red-300 border-0'}
            >
              {hw?.camera.connected ? 'Connected' : 'Disconnected'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0 1.5rem 1.5rem' }}>
          {/* Camera device selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40 uppercase tracking-wider">Active Camera</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-white/40 hover:text-white/70 h-auto py-0.5 px-2 text-xs"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['cameras'] })}
                disabled={camerasLoading}
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${camerasLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
            <Select
              value={activeCamera ? String(activeCamera.index) : undefined}
              onValueChange={(val) => selectCameraMut.mutate(Number(val))}
              disabled={selectCameraMut.isPending}
            >
              <SelectTrigger className="input-surface text-white" style={{ padding: '0.75rem 1rem', height: 'auto' }}>
                <SelectValue placeholder={detectedDevices.length === 0 ? 'No cameras detected' : 'Select camera...'} />
              </SelectTrigger>
              <SelectContent>
                {(cameras?.devices ?? []).map((device) => (
                  <SelectItem key={device.index} value={String(device.index)}>
                    {device.path} — {device.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Active camera info */}
          {activeCamera && (
            <div className="text-sm text-white/40">
              {activeCamera.path} — {activeCamera.name}
              {activeCamera.resolutions.length > 0 && (
                <span className="text-white/25 ml-2">
                  ({activeCamera.resolutions.map((r) => `${r.width}x${r.height}`).join(', ')})
                </span>
              )}
            </div>
          )}

          {/* Streaming status */}
          <p className="text-sm text-white/60">
            Status: <span className={hw?.camera.status.streaming ? 'text-emerald-400' : 'text-white/40'}>
              {hw?.camera.status.streaming ? 'Streaming' : 'Idle'}
            </span>
          </p>

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => testCameraMut.mutate()}
              disabled={testCameraMut.isPending}
              className="btn-secondary border-0 text-sm"
            >
              {testCameraMut.isPending ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : null}
              Test Camera
            </Button>
            <Button
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
              className="btn-secondary border-0 text-sm"
            >
              {showPreview ? 'Hide Preview' : 'Show Preview'}
            </Button>
          </div>

          {/* Camera preview */}
          {showPreview && (
            <div className="rounded-lg overflow-hidden bg-black/50" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
              <img
                src={`${CAMERA_STREAM_URL}&t=${Date.now()}`}
                alt="Camera preview"
                className="w-full"
                style={{ maxHeight: '360px', objectFit: 'contain' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '';
                  (e.target as HTMLImageElement).alt = 'Camera stream unavailable';
                }}
              />
              <p className="text-xs text-white/25 text-center py-1.5">Live camera feed</p>
            </div>
          )}

          {/* No cameras detected message */}
          {detectedDevices.length === 0 && !camerasLoading && (
            <div className="text-sm text-amber-400/70 bg-amber-500/10 rounded-lg px-4 py-3" style={{ border: '1px solid rgba(245,158,11,0.15)' }}>
              No cameras detected. Make sure your camera is connected and click Refresh to scan again.
            </div>
          )}
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
