import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api/adminApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Sparkles, Loader2 } from 'lucide-react';

const DEFAULT_PROMPT = 'You are a witty vibe reader. Analyze the person in the photo and generate a fun, personalized reading about their aura, energy, and vibe. Keep it lighthearted, positive, and shareable. Response should be 2-3 short paragraphs.';

export default function VibeCheckConfig() {
  const queryClient = useQueryClient();
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => adminApi.getConfig().then((r) => r.data),
  });

  const vcConfig = (config?.categories?.vibe_check ?? {}) as Record<string, unknown>;
  const pbConfig = (config?.categories?.photobooth ?? {}) as Record<string, unknown>;
  const photoboothEnabled = String(pbConfig.photobooth_enabled ?? 'true') === 'true';

  const [enabled, setEnabled] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT);

  useEffect(() => {
    if (vcConfig.vibe_check_enabled !== undefined)
      setEnabled(String(vcConfig.vibe_check_enabled) === 'true');
    if (vcConfig.vibe_check_system_prompt)
      setSystemPrompt(String(vcConfig.vibe_check_system_prompt));
  }, [vcConfig]);

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => adminApi.updateConfig('vibe_check', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      toast.success('Vibe Check configuration saved');
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Failed to save configuration');
    },
  });

  const handleToggle = (value: boolean) => {
    if (!value && !photoboothEnabled) {
      toast.error('At least one feature must stay enabled. Enable Photobooth first.');
      return;
    }
    setEnabled(value);
  };

  const handleSave = () => {
    saveMutation.mutate({
      vibe_check_enabled: enabled,
      vibe_check_system_prompt: systemPrompt,
    });
  };

  return (
    <Card className="card-surface border-0">
      <CardHeader style={{ padding: '1.5rem' }}>
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <CardTitle className="font-display text-white">Vibe Check Settings</CardTitle>
        </div>
        <p className="text-xs text-white/25" style={{ marginTop: '0.5rem' }}>
          Configure the vibe check feature and AI analysis prompt. The prompt shapes how the AI interprets photos and generates readings.
        </p>
      </CardHeader>
      <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: '0 2rem 2rem' }}>
        {/* Enable toggle */}
        <div className="flex items-center justify-between" style={{ padding: '0.5rem 0' }}>
          <div>
            <Label className="text-xs text-white/40 uppercase tracking-wider">Enable Vibe Check</Label>
            <p className="text-xs text-white/25" style={{ marginTop: '0.25rem' }}>
              Allow users to capture a photo and receive an AI vibe reading. At least one feature must stay enabled.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={handleToggle} />
        </div>

        {/* System prompt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Label className="text-xs text-white/40 uppercase tracking-wider">AI System Prompt</Label>
          <p className="text-xs text-white/25">
            Instructions that shape how the AI analyzes photos and generates vibe readings. Be specific about tone, length, and style.
            The AI model and provider are configured in <span className="text-white/40">Configuration &rarr; AI Provider</span>.
          </p>
          <Textarea
            rows={6}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder={DEFAULT_PROMPT}
            className="input-surface text-white placeholder:text-white/20 resize-none"
            style={{ padding: '0.75rem 1rem' }}
          />
          <p className="text-xs text-white/20">
            {systemPrompt.length} characters
          </p>
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
