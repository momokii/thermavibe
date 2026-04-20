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
import { CreditCard, Loader2 } from 'lucide-react';

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
    <Card className="card-surface border-0">
      <CardHeader style={{ padding: '1.5rem' }}>
        <div className="flex items-center gap-2.5">
          <CreditCard className="h-4 w-4 text-violet-400" />
          <CardTitle className="font-display text-white">Payment Settings</CardTitle>
        </div>
        <p className="text-xs text-white/25" style={{ marginTop: '0.5rem' }}>
          Configure payment for the kiosk. When enabled, users must pay before receiving their vibe reading.
        </p>
      </CardHeader>
      <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: '0 2rem 2rem' }}>
        <div className="flex items-center justify-between" style={{ padding: '0.5rem 0' }}>
          <div>
            <Label className="text-xs text-white/40 uppercase tracking-wider">Enable Payment</Label>
            <p className="text-xs text-white/25" style={{ marginTop: '0.25rem' }}>
              Turn on to require payment before each session. Disable for free-mode kiosks.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Label className="text-xs text-white/40 uppercase tracking-wider">Provider</Label>
          <p className="text-xs text-white/25">The payment gateway that processes QRIS transactions. Use Mock for testing without real payments.</p>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger className="input-surface text-white" style={{ padding: '0.75rem 1rem', height: 'auto' }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mock">Mock (Testing)</SelectItem>
              <SelectItem value="midtrans">Midtrans</SelectItem>
              <SelectItem value="xendit">Xendit</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Label className="text-xs text-white/40 uppercase tracking-wider">Amount (IDR)</Label>
          <p className="text-xs text-white/25">Price per session in Indonesian Rupiah. This is the amount the customer pays via QRIS.</p>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input-surface text-white placeholder:text-white/20"
            style={{ padding: '0.75rem 1rem' }}
          />
        </div>
        {provider !== 'mock' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Label className="text-xs text-white/40 uppercase tracking-wider">Server Key</Label>
            <p className="text-xs text-white/25">API secret key from your payment provider dashboard. Keep this confidential.</p>
            <Input
              type="password"
              value={serverKey}
              onChange={(e) => setServerKey(e.target.value)}
              className="input-surface text-white placeholder:text-white/20"
              style={{ padding: '0.75rem 1rem' }}
            />
          </div>
        )}
        <div className="flex items-center justify-between" style={{ padding: '0.5rem 0' }}>
          <div>
            <Label className="text-xs text-white/40 uppercase tracking-wider">Sandbox Mode</Label>
            <p className="text-xs text-white/25" style={{ marginTop: '0.25rem' }}>
              Use the provider&apos;s test environment. No real charges will be made.
            </p>
          </div>
          <Switch checked={sandbox} onCheckedChange={setSandbox} />
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
