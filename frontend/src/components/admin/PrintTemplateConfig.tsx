import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api/adminApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Printer, Loader2 } from 'lucide-react';

const MAX_NAME_LENGTH = 24;

const TZ_PRESETS = [
  { label: 'Jakarta (WIB, +7)', value: '+7' },
  { label: 'Singapore (+8)', value: '+8' },
  { label: 'Tokyo (JST, +9)', value: '+9' },
  { label: 'Seoul (KST, +9)', value: '+9' },
  { label: 'Bangkok (ICT, +7)', value: '+7' },
  { label: 'Kuala Lumpur (+8)', value: '+8' },
  { label: 'UTC (+0)', value: '+0' },
  { label: 'London (GMT, +0)', value: '+0' },
  { label: 'New York (EST, -5)', value: '-5' },
];

export default function PrintTemplateConfig() {
  const queryClient = useQueryClient();
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => adminApi.getConfig().then((r) => r.data),
  });

  const printConfig = (config?.categories?.print ?? {}) as Record<string, unknown>;

  const [footerName, setFooterName] = useState('VibePrint OS');
  const [tzOffset, setTzOffset] = useState('+7');
  const [customTz, setCustomTz] = useState(false);
  const [footerEnabled, setFooterEnabled] = useState(true);
  const [nameEnabled, setNameEnabled] = useState(true);
  const [timestampEnabled, setTimestampEnabled] = useState(true);

  useEffect(() => {
    if (printConfig.print_footer_name !== undefined)
      setFooterName(String(printConfig.print_footer_name));
    if (printConfig.print_timezone_offset !== undefined) {
      const val = String(printConfig.print_timezone_offset);
      setTzOffset(val);
      const matchesPreset = TZ_PRESETS.some((p) => p.value === val);
      setCustomTz(!matchesPreset);
    }
    if (printConfig.print_footer_enabled !== undefined)
      setFooterEnabled(String(printConfig.print_footer_enabled) === 'true');
    if (printConfig.print_footer_name_enabled !== undefined)
      setNameEnabled(String(printConfig.print_footer_name_enabled) === 'true');
    if (printConfig.print_footer_timestamp_enabled !== undefined)
      setTimestampEnabled(String(printConfig.print_footer_timestamp_enabled) === 'true');
  }, [printConfig]);

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => adminApi.updateConfig('print', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      toast.success('Print template saved');
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Failed to save print template');
    },
  });

  const handleSave = () => {
    if (footerEnabled && nameEnabled && footerName.length > MAX_NAME_LENGTH) {
      toast.error(`Footer name must be ${MAX_NAME_LENGTH} characters or fewer`);
      return;
    }
    saveMutation.mutate({
      print_footer_name: footerName,
      print_timezone_offset: tzOffset,
      print_footer_enabled: String(footerEnabled),
      print_footer_name_enabled: String(nameEnabled),
      print_footer_timestamp_enabled: String(timestampEnabled),
    });
  };

  // Live preview timestamp
  const previewTime = (() => {
    const offset = parseInt(tzOffset) || 0;
    const now = new Date();
    now.setMinutes(now.getMinutes() + now.getTimezoneOffset() + offset * 60);
    return now.toISOString().slice(0, 16).replace('T', ' ');
  })();

  const separator = '-'.repeat(32);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Card className="card-surface border-0">
        <CardHeader style={{ padding: '1.5rem' }}>
          <div className="flex items-center gap-2.5">
            <Printer className="h-4 w-4 text-violet-400" />
            <CardTitle className="font-display text-white">Print Template</CardTitle>
          </div>
          <p className="text-xs text-white/25" style={{ marginTop: '0.5rem' }}>
            Configure the footer printed on all receipts (Vibe Check and Photobooth). Toggle each element
            on or off to control what appears on printed output.
          </p>
        </CardHeader>
        <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: '0 2rem 2rem' }}>
          {/* Master footer toggle */}
          <div className="flex items-center justify-between" style={{ padding: '0.5rem 0' }}>
            <div>
              <Label className="text-xs text-white/40 uppercase tracking-wider">Print Footer</Label>
              <p className="text-xs text-white/25" style={{ marginTop: '0.25rem' }}>
                Show a footer section at the bottom of every printed receipt.
              </p>
            </div>
            <Switch checked={footerEnabled} onCheckedChange={setFooterEnabled} />
          </div>

          {/* Brand name toggle + input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', opacity: footerEnabled ? 1 : 0.4, pointerEvents: footerEnabled ? 'auto' : 'none' }}>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs text-white/40 uppercase tracking-wider">Brand Name</Label>
                <p className="text-xs text-white/25" style={{ marginTop: '0.25rem' }}>
                  Your brand or event name printed at the bottom.
                </p>
              </div>
              <Switch checked={nameEnabled} onCheckedChange={setNameEnabled} />
            </div>
            {nameEnabled && (
              <div className="flex items-center gap-3">
                <Input
                  type="text"
                  maxLength={MAX_NAME_LENGTH}
                  value={footerName}
                  onChange={(e) => setFooterName(e.target.value)}
                  placeholder="VibePrint OS"
                  className="input-surface text-white placeholder:text-white/20 w-64"
                  style={{ padding: '0.75rem 1rem' }}
                />
                <span className={`text-xs tabular-nums ${footerName.length > MAX_NAME_LENGTH ? 'text-red-400' : 'text-white/20'}`}>
                  {footerName.length}/{MAX_NAME_LENGTH}
                </span>
              </div>
            )}
          </div>

          {/* Timestamp toggle + timezone */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', opacity: footerEnabled ? 1 : 0.4, pointerEvents: footerEnabled ? 'auto' : 'none' }}>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs text-white/40 uppercase tracking-wider">Timestamp</Label>
                <p className="text-xs text-white/25" style={{ marginTop: '0.25rem' }}>
                  Date and time printed on the receipt using the timezone below.
                </p>
              </div>
              <Switch checked={timestampEnabled} onCheckedChange={setTimestampEnabled} />
            </div>
            {timestampEnabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <p className="text-xs text-white/25">
                  UTC offset for printed timestamps. For Jakarta, use +7 (WIB).
                </p>
                {!customTz ? (
                  <select
                    value={tzOffset}
                    onChange={(e) => {
                      if (e.target.value === '__custom') {
                        setCustomTz(true);
                        setTzOffset('+0');
                      } else {
                        setTzOffset(e.target.value);
                      }
                    }}
                    className="input-surface text-white text-sm rounded-lg w-64"
                    style={{ padding: '0.75rem 1rem' }}
                  >
                    {TZ_PRESETS.map((p) => (
                      <option key={p.label} value={p.value}>{p.label}</option>
                    ))}
                    <option value="__custom">Custom offset...</option>
                  </select>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={tzOffset}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^[+-]?\d{0,2}$/.test(val)) setTzOffset(val);
                      }}
                      placeholder="+7"
                      className="input-surface text-white w-24"
                      style={{ padding: '0.75rem 1rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => setCustomTz(false)}
                      className="text-xs text-white/30 hover:text-white/50 underline"
                    >
                      Back to presets
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Save */}
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="btn-primary border-0"
            style={{ alignSelf: 'flex-start', padding: '0.75rem 1.5rem' }}
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            {saveMutation.isPending ? 'Saving...' : 'Save Template'}
          </Button>
        </CardContent>
      </Card>

      {/* Live preview */}
      <Card className="card-surface border-0">
        <CardHeader style={{ padding: '1.5rem' }}>
          <CardTitle className="font-display text-white text-base">Footer Preview</CardTitle>
          <p className="text-xs text-white/25" style={{ marginTop: '0.25rem' }}>
            How the footer will appear on printed receipts.
          </p>
        </CardHeader>
        <CardContent style={{ padding: '0 2rem 2rem' }}>
          <div
            className="bg-white/[0.03] rounded-xl font-mono text-sm text-white/60"
            style={{ padding: '1.5rem', maxWidth: '20rem' }}
          >
            <p className="text-white/20">...receipt content above...</p>
            {footerEnabled ? (
              <>
                <p className="mt-2">{separator}</p>
                {nameEnabled && <p className="text-center">{footerName || 'VibePrint OS'}</p>}
                {timestampEnabled && <p className="text-center">{previewTime}</p>}
              </>
            ) : (
              <p className="mt-2 text-white/15 italic">No footer</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
