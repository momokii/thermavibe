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

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <Card>
      <CardHeader>
        <CardTitle>AI Provider</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Provider</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger><SelectValue /></SelectTrigger>
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
            <Label>API Key</Label>
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
          </div>
        )}
        <div className="space-y-2">
          <Label>Model</Label>
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" />
        </div>
        <div className="space-y-2">
          <Label>System Prompt</Label>
          <Textarea rows={4} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="You are a vibe reading AI..." />
        </div>
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving...' : 'Save Configuration'}
        </Button>
      </CardContent>
    </Card>
  );
}
