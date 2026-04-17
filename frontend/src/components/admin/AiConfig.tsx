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
  const [apiKey, setApiKey] = useState(aiConfig.api_key as string ?? '');
  const [model, setModel] = useState(aiConfig.model as string ?? '');
  const [systemPrompt, setSystemPrompt] = useState(aiConfig.system_prompt as string ?? '');

  useEffect(() => {
    if (aiConfig.provider) setProvider(aiConfig.provider as string);
    if (aiConfig.api_key) setApiKey(aiConfig.api_key as string);
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
    saveMutation.mutate({ provider, api_key: apiKey, model, system_prompt: systemPrompt });
  };

  return (
    <Card className="card-surface border-0">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <CardTitle className="font-display text-white">AI Provider</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label className="text-xs text-white/40 uppercase tracking-wider">Provider</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger className="input-surface text-white">
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
        {provider !== 'mock' && provider !== 'ollama' && (
          <div className="space-y-2">
            <Label className="text-xs text-white/40 uppercase tracking-wider">API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="input-surface text-white placeholder:text-white/20"
            />
          </div>
        )}
        <div className="space-y-2">
          <Label className="text-xs text-white/40 uppercase tracking-wider">Model</Label>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4o-mini"
            className="input-surface text-white placeholder:text-white/20"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-white/40 uppercase tracking-wider">System Prompt</Label>
          <Textarea
            rows={4}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="You are a vibe reading AI..."
            className="input-surface text-white placeholder:text-white/20 resize-none"
          />
        </div>
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="btn-primary border-0"
        >
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
          {saveMutation.isPending ? 'Saving...' : 'Save Configuration'}
        </Button>
      </CardContent>
    </Card>
  );
}
