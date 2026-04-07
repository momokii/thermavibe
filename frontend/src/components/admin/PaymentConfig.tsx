import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api/adminApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function PaymentConfig() {
  const queryClient = useQueryClient();
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => adminApi.getConfig().then((r) => r.data),
  });

  const payConfig = config?.categories?.payment ?? {};
  const [enabled, setEnabled] = useState(payConfig.enabled as boolean ?? false);
  const [provider, setProvider] = useState(payConfig.provider as string ?? 'mock');
  const [amount, setAmount] = useState(String(payConfig.amount ?? 10000));
  const [serverKey, setServerKey] = useState(payConfig.server_key as string ?? '');
  const [sandbox, setSandbox] = useState(payConfig.sandbox as boolean ?? true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (payConfig.enabled !== undefined) setEnabled(payConfig.enabled as boolean);
    if (payConfig.provider) setProvider(payConfig.provider as string);
    if (payConfig.amount) setAmount(String(payConfig.amount));
    if (payConfig.server_key) setServerKey(payConfig.server_key as string);
    if (payConfig.sandbox !== undefined) setSandbox(payConfig.sandbox as boolean);
  }, [payConfig]);

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => adminApi.updateConfig('payment', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      toast.success('Payment configuration saved');
    },
    onError: () => toast.error('Failed to save configuration'),
  });

  const handleSave = () => {
    saveMutation.mutate({ enabled, provider, amount: Number(amount), server_key: serverKey, sandbox });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Enable Payment</Label>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="space-y-2">
          <Label>Provider</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mock">Mock (Testing)</SelectItem>
              <SelectItem value="midtrans">Midtrans</SelectItem>
              <SelectItem value="xendit">Xendit</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Amount (IDR)</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        {provider !== 'mock' && (
          <div className="space-y-2">
            <Label>Server Key</Label>
            <Input type="password" value={serverKey} onChange={(e) => setServerKey(e.target.value)} />
          </div>
        )}
        <div className="flex items-center justify-between">
          <Label>Sandbox Mode</Label>
          <Switch checked={sandbox} onCheckedChange={setSandbox} />
        </div>
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving...' : 'Save Configuration'}
        </Button>
      </CardContent>
    </Card>
  );
}
