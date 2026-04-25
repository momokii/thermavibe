import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api/adminApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Camera, Loader2 } from 'lucide-react';

export default function PhotoboothConfig() {
  const queryClient = useQueryClient();
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => adminApi.getConfig().then((r) => r.data),
  });

  const pbConfig = (config?.categories?.photobooth ?? {}) as Record<string, unknown>;

  const [enabled, setEnabled] = useState(false);
  const [timeLimit, setTimeLimit] = useState('30');
  const [maxPhotos, setMaxPhotos] = useState('8');
  const [minPhotos, setMinPhotos] = useState('2');
  const [defaultRows, setDefaultRows] = useState('4');
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkText, setWatermarkText] = useState('VibePrint OS');
  const [retentionHours, setRetentionHours] = useState('168');

  useEffect(() => {
    if (pbConfig.photobooth_enabled !== undefined)
      setEnabled(String(pbConfig.photobooth_enabled) === 'true');
    if (pbConfig.photobooth_capture_time_limit_seconds)
      setTimeLimit(String(pbConfig.photobooth_capture_time_limit_seconds));
    if (pbConfig.photobooth_max_photos)
      setMaxPhotos(String(pbConfig.photobooth_max_photos));
    if (pbConfig.photobooth_min_photos)
      setMinPhotos(String(pbConfig.photobooth_min_photos));
    if (pbConfig.photobooth_default_layout_rows)
      setDefaultRows(String(pbConfig.photobooth_default_layout_rows));
    if (pbConfig.photobooth_watermark_enabled !== undefined)
      setWatermarkEnabled(String(pbConfig.photobooth_watermark_enabled) === 'true');
    if (pbConfig.photobooth_watermark_text)
      setWatermarkText(String(pbConfig.photobooth_watermark_text));
    if (pbConfig.photobooth_composite_retention_hours)
      setRetentionHours(String(pbConfig.photobooth_composite_retention_hours));
  }, [pbConfig]);

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => adminApi.updateConfig('photobooth', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      toast.success('Photobooth configuration saved');
    },
    onError: () => toast.error('Failed to save configuration'),
  });

  const handleSave = () => {
    saveMutation.mutate({
      photobooth_enabled: enabled,
      photobooth_capture_time_limit_seconds: Number(timeLimit),
      photobooth_max_photos: Number(maxPhotos),
      photobooth_min_photos: Number(minPhotos),
      photobooth_default_layout_rows: Number(defaultRows),
      photobooth_watermark_enabled: watermarkEnabled,
      photobooth_watermark_text: watermarkText,
      photobooth_composite_retention_hours: Number(retentionHours),
    });
  };

  return (
    <Card className="card-surface border-0">
      <CardHeader style={{ padding: '1.5rem' }}>
        <div className="flex items-center gap-2.5">
          <Camera className="h-4 w-4 text-pink-400" />
          <CardTitle className="font-display text-white">Photobooth Settings</CardTitle>
        </div>
        <p className="text-xs text-white/25" style={{ marginTop: '0.5rem' }}>
          Configure the photobooth feature: capture timing, layout options, watermark, and data retention.
        </p>
      </CardHeader>
      <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: '0 2rem 2rem' }}>
        {/* Enable toggle */}
        <div className="flex items-center justify-between" style={{ padding: '0.5rem 0' }}>
          <div>
            <Label className="text-xs text-white/40 uppercase tracking-wider">Enable Photobooth</Label>
            <p className="text-xs text-white/25" style={{ marginTop: '0.25rem' }}>
              Allow users to create photo strips. At least one feature must stay enabled.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {/* Capture time limit */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Label className="text-xs text-white/40 uppercase tracking-wider">Capture Time Limit (seconds)</Label>
          <p className="text-xs text-white/25">How long users have to take photos during the capture phase.</p>
          <Input
            type="number"
            value={timeLimit}
            onChange={(e) => setTimeLimit(e.target.value)}
            className="input-surface text-white placeholder:text-white/20"
            style={{ padding: '0.75rem 1rem' }}
            min="5"
            max="120"
          />
        </div>

        {/* Max/min photos */}
        <div className="grid grid-cols-2 gap-6">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Label className="text-xs text-white/40 uppercase tracking-wider">Max Photos</Label>
            <p className="text-xs text-white/25">Maximum photos per session.</p>
            <Input
              type="number"
              value={maxPhotos}
              onChange={(e) => setMaxPhotos(e.target.value)}
              className="input-surface text-white placeholder:text-white/20"
              style={{ padding: '0.75rem 1rem' }}
              min="1"
              max="12"
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Label className="text-xs text-white/40 uppercase tracking-wider">Min Photos</Label>
            <p className="text-xs text-white/25">Minimum photos needed to create a strip.</p>
            <Input
              type="number"
              value={minPhotos}
              onChange={(e) => setMinPhotos(e.target.value)}
              className="input-surface text-white placeholder:text-white/20"
              style={{ padding: '0.75rem 1rem' }}
              min="1"
              max="4"
            />
          </div>
        </div>

        {/* Default layout rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Label className="text-xs text-white/40 uppercase tracking-wider">Default Layout Rows</Label>
          <p className="text-xs text-white/25">Default number of photo slots in the strip (1–4).</p>
          <Input
            type="number"
            value={defaultRows}
            onChange={(e) => setDefaultRows(e.target.value)}
            className="input-surface text-white placeholder:text-white/20"
            style={{ padding: '0.75rem 1rem' }}
            min="1"
            max="4"
          />
        </div>

        {/* Watermark */}
        <div className="flex items-center justify-between" style={{ padding: '0.5rem 0' }}>
          <div>
            <Label className="text-xs text-white/40 uppercase tracking-wider">Watermark</Label>
            <p className="text-xs text-white/25" style={{ marginTop: '0.25rem' }}>
              Add a text watermark to the bottom of generated strips.
            </p>
          </div>
          <Switch checked={watermarkEnabled} onCheckedChange={setWatermarkEnabled} />
        </div>

        {watermarkEnabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Label className="text-xs text-white/40 uppercase tracking-wider">Watermark Text</Label>
            <p className="text-xs text-white/25">Text displayed at the bottom of each photobooth strip.</p>
            <Input
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              className="input-surface text-white placeholder:text-white/20"
              style={{ padding: '0.75rem 1rem' }}
              placeholder="VibePrint OS"
            />
          </div>
        )}

        {/* Retention */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Label className="text-xs text-white/40 uppercase tracking-wider">Composite Retention (hours)</Label>
          <p className="text-xs text-white/25">How long to keep photobooth strips for admin viewing. Set to 0 for forever.</p>
          <Input
            type="number"
            value={retentionHours}
            onChange={(e) => setRetentionHours(e.target.value)}
            className="input-surface text-white placeholder:text-white/20"
            style={{ padding: '0.75rem 1rem' }}
            min="0"
          />
        </div>

        {/* Save */}
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="btn-primary border-0"
          style={{ alignSelf: 'flex-start', padding: '0.75rem 1.5rem' }}
        >
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
          {saveMutation.isPending ? 'Saving...' : 'Save Configuration'}
        </Button>
      </CardContent>
    </Card>
  );
}
