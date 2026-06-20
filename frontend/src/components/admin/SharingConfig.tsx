import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api/adminApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Share2, Loader2 } from 'lucide-react';

const DEFAULT_COLOR = '#000000';
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export default function SharingConfig() {
  const queryClient = useQueryClient();
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => adminApi.getConfig().then((r) => r.data),
  });

  const sharingConfig = (config?.categories?.sharing ?? {}) as Record<string, unknown>;

  const [brandName, setBrandName] = useState('');
  const [handle, setHandle] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);

  useEffect(() => {
    if (sharingConfig.share_brand_name !== undefined)
      setBrandName(String(sharingConfig.share_brand_name));
    if (sharingConfig.share_brand_handle !== undefined)
      setHandle(String(sharingConfig.share_brand_handle));
    if (sharingConfig.share_brand_color !== undefined)
      setColor(String(sharingConfig.share_brand_color) || DEFAULT_COLOR);
  }, [sharingConfig]);

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => adminApi.updateConfig('sharing', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      toast.success('Sharing branding saved');
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Failed to save sharing branding');
    },
  });

  const handleSave = () => {
    const trimmedColor = color.trim() || DEFAULT_COLOR;
    if (!HEX_COLOR_RE.test(trimmedColor)) {
      toast.error('Accent color must be a 6-digit hex like #C8553D');
      return;
    }
    saveMutation.mutate({
      share_brand_name: brandName.trim(),
      share_brand_handle: handle.trim(),
      share_brand_color: trimmedColor,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Card className="card-surface border-0">
        <CardHeader style={{ padding: '1.5rem' }}>
          <div className="flex items-center gap-2.5">
            <Share2 className="h-4 w-4 text-violet-400" />
            <CardTitle className="font-display text-white">Share Landing Page</CardTitle>
          </div>
          <p className="text-xs text-white/25" style={{ marginTop: '0.5rem' }}>
            Branding shown on the mobile page customers see when they scan the photobooth share QR code.
            Leave fields empty to use defaults.
          </p>
        </CardHeader>
        <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: '0 2rem 2rem' }}>
          {/* Brand name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <Label className="text-xs text-white/40 uppercase tracking-wider">Brand Name</Label>
              <p className="text-xs text-white/25" style={{ marginTop: '0.25rem' }}>
                Venue or event name shown as the page heading. Leave empty to use &quot;VibePrint&quot;.
              </p>
            </div>
            <Input
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="VibePrint"
              className="input-surface text-white placeholder:text-white/20 w-64"
              style={{ padding: '0.75rem 1rem' }}
            />
          </div>

          {/* Social handle */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <Label className="text-xs text-white/40 uppercase tracking-wider">Social Handle</Label>
              <p className="text-xs text-white/25" style={{ marginTop: '0.25rem' }}>
                Optional. Shown as &quot;Tag {`{handle}`} — we&apos;d love to see it!&quot; under the Download
                button. Leave empty to hide the line.
              </p>
            </div>
            <Input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@yourcafe"
              className="input-surface text-white placeholder:text-white/20 w-64"
              style={{ padding: '0.75rem 1rem' }}
            />
          </div>

          {/* Accent color */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <Label className="text-xs text-white/40 uppercase tracking-wider">Accent Color</Label>
              <p className="text-xs text-white/25" style={{ marginTop: '0.25rem' }}>
                Hex color applied to the page heading and Download button background.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={HEX_COLOR_RE.test(color) ? color : DEFAULT_COLOR}
                onChange={(e) => setColor(e.target.value)}
                className="h-11 w-16 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                aria-label="Color picker"
              />
              <Input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder={DEFAULT_COLOR}
                className="input-surface text-white placeholder:text-white/20 w-32 font-mono"
                style={{ padding: '0.75rem 1rem' }}
              />
              <span className="text-xs text-white/20">Preview:</span>
              <span
                className="inline-block h-6 w-6 rounded-md border border-white/10"
                style={{ backgroundColor: HEX_COLOR_RE.test(color) ? color : DEFAULT_COLOR }}
              />
            </div>
          </div>

          {/* Save */}
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="btn-primary border-0"
            style={{ alignSelf: 'flex-start', padding: '0.75rem 1.5rem' }}
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            {saveMutation.isPending ? 'Saving...' : 'Save Branding'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
