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
    <Card className="bg-white/[0.03] border-white/[0.08] overflow-hidden relative">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500" />
      <CardHeader>
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-pink-400" />
          <CardTitle className="font-display">Payment Settings</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between py-1">
          <Label className="text-muted-foreground text-xs uppercase tracking-wider">Enable Payment</Label>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="space-y-2">
          <Label className="text-muted-foreground text-xs uppercase tracking-wider">Provider</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger className="bg-white/[0.04] border-white/[0.08]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mock">Mock (Testing)</SelectItem>
              <SelectItem value="midtrans">Midtrans</SelectItem>
              <SelectItem value="xendit">Xendit</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-muted-foreground text-xs uppercase tracking-wider">Amount (IDR)</Label>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="bg-white/[0.04] border-white/[0.08]"
          />
        </div>
        {provider !== 'mock' && (
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Server Key</Label>
            <Input
              type="password"
              value={serverKey}
              onChange={(e) => setServerKey(e.target.value)}
              className="bg-white/[0.04] border-white/[0.08]"
            />
          </div>
        )}
        <div className="flex items-center justify-between py-1">
          <Label className="text-muted-foreground text-xs uppercase tracking-wider">Sandbox Mode</Label>
          <Switch checked={sandbox} onCheckedChange={setSandbox} />
        </div>
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="btn-gradient border-0 shadow-lg shadow-pink-500/20 hover:shadow-pink-500/30"
        >
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
          {saveMutation.isPending ? 'Saving...' : 'Save Configuration'}
        </Button>
      </CardContent>
    </Card>
  );
}
