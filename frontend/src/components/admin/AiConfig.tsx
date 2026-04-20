import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api/adminApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Sparkles, Loader2 } from 'lucide-react';

export default function AiConfig() {
  const queryClient = useQueryClient();
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => adminApi.getConfig().then((r) => r.data),
  });

  const aiConfig = config?.categories?.ai ?? {};
  const [provider, setProvider] = useState(aiConfig.provider as string ?? 'mock');
  const [openaiKey, setOpenaiKey] = useState(aiConfig.openai_api_key as string ?? '');
  const [anthropicKey, setAnthropicKey] = useState(aiConfig.anthropic_api_key as string ?? '');
  const [googleKey, setGoogleKey] = useState(aiConfig.google_api_key as string ?? '');
  const [ollamaUrl, setOllamaUrl] = useState(aiConfig.ollama_base_url as string ?? 'http://localhost:11434');
  const [model, setModel] = useState(aiConfig.model as string ?? '');
  const [systemPrompt, setSystemPrompt] = useState(aiConfig.system_prompt as string ?? '');

  useEffect(() => {
    if (aiConfig.provider) setProvider(aiConfig.provider as string);
    if (aiConfig.openai_api_key) setOpenaiKey(aiConfig.openai_api_key as string);
    if (aiConfig.anthropic_api_key) setAnthropicKey(aiConfig.anthropic_api_key as string);
    if (aiConfig.google_api_key) setGoogleKey(aiConfig.google_api_key as string);
    if (aiConfig.ollama_base_url) setOllamaUrl(aiConfig.ollama_base_url as string);
    if (aiConfig.model) setModel(aiConfig.model as string);
    if (aiConfig.system_prompt) setSystemPrompt(aiConfig.system_prompt as string);
  }, [aiConfig]);

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => adminApi.updateConfig('ai', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      toast.success('AI configuration saved');
    },
    onError: () => toast.error('Failed to save configuration'),
  });

  const handleSave = () => {
    saveMutation.mutate({
      provider,
      openai_api_key: openaiKey,
      anthropic_api_key: anthropicKey,
      google_api_key: googleKey,
      ollama_base_url: ollamaUrl,
      model,
      system_prompt: systemPrompt,
    });
  };

  return (
    <Card className="card-surface border-0">
      <CardHeader style={{ padding: '1.5rem' }}>
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <CardTitle className="font-display text-white">AI Provider</CardTitle>
        </div>
        <p className="text-xs text-white/25" style={{ marginTop: '0.5rem' }}>
          Configure the AI service that analyzes photos and generates vibe readings. The selected provider handles all image analysis.
        </p>
      </CardHeader>
      <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: '0 2rem 2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Label className="text-xs text-white/40 uppercase tracking-wider">Provider</Label>
          <p className="text-xs text-white/25">The AI engine used for photo analysis. Each provider has different models and pricing.</p>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger className="input-surface text-white" style={{ padding: '0.75rem 1rem', height: 'auto' }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mock">Mock (Testing)</SelectItem>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="google">Google Gemini</SelectItem>
              <SelectItem value="ollama">Ollama (Local)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {provider === 'openai' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Label className="text-xs text-white/40 uppercase tracking-wider">OpenAI API Key</Label>
            <p className="text-xs text-white/25">Your OpenAI API key. Required to use GPT-4o Vision for photo analysis.</p>
            <Input
              type="password"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-..."
              className="input-surface text-white placeholder:text-white/20"
              style={{ padding: '0.75rem 1rem' }}
            />
          </div>
        )}
        {provider === 'anthropic' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Label className="text-xs text-white/40 uppercase tracking-wider">Anthropic API Key</Label>
            <p className="text-xs text-white/25">Your Anthropic API key. Required to use Claude Vision for photo analysis.</p>
            <Input
              type="password"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder="sk-ant-..."
              className="input-surface text-white placeholder:text-white/20"
              style={{ padding: '0.75rem 1rem' }}
            />
          </div>
        )}
        {provider === 'google' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Label className="text-xs text-white/40 uppercase tracking-wider">Google API Key</Label>
            <p className="text-xs text-white/25">Your Google AI API key. Required to use Gemini Vision for photo analysis.</p>
            <Input
              type="password"
              value={googleKey}
              onChange={(e) => setGoogleKey(e.target.value)}
              placeholder="AI..."
              className="input-surface text-white placeholder:text-white/20"
              style={{ padding: '0.75rem 1rem' }}
            />
          </div>
        )}
        {provider === 'ollama' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Label className="text-xs text-white/40 uppercase tracking-wider">Ollama Base URL</Label>
            <p className="text-xs text-white/25">URL where Ollama is running. Use <code className="text-white/40">host.docker.internal:11434</code> if the backend runs in Docker.</p>
            <Input
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              placeholder="http://localhost:11434"
              className="input-surface text-white placeholder:text-white/20"
              style={{ padding: '0.75rem 1rem' }}
            />
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Label className="text-xs text-white/40 uppercase tracking-wider">Model</Label>
          <p className="text-xs text-white/25">The specific model to use. Example: <code className="text-white/40">gpt-4o-mini</code> (OpenAI), <code className="text-white/40">llava-phi3</code> (Ollama).</p>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4o-mini"
            className="input-surface text-white placeholder:text-white/20"
            style={{ padding: '0.75rem 1rem' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Label className="text-xs text-white/40 uppercase tracking-wider">System Prompt</Label>
          <p className="text-xs text-white/25">Instructions that shape how the AI responds. This tells the AI how to interpret photos and what kind of reading to generate.</p>
          <Textarea
            rows={4}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="You are a vibe reading AI..."
            className="input-surface text-white placeholder:text-white/20 resize-none"
            style={{ padding: '0.75rem 1rem' }}
          />
        </div>
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
