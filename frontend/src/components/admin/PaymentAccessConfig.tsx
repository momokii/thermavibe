import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { adminApi } from '@/api/adminApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  CreditCard,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
  Ban,
  QrCode,
  Copy,
  Plus,
  X,
} from 'lucide-react';
import type { AccessCodeResponse } from '@/api/types';

type EntryMethod = 'free' | 'payment' | 'access_code';

export default function PaymentAccessConfig() {
  const queryClient = useQueryClient();

  // Tick every 60s to keep relative expiry times accurate
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  // ── Config query ──────────────────────────────────────────────
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => adminApi.getConfig().then((r) => r.data),
  });

  const payConfig = (config?.categories?.payment ?? {}) as Record<string, unknown>;
  const acConfig = (config?.categories?.access_code ?? {}) as Record<string, unknown>;

  // Derive entry method from DB config
  const paymentEnabled = String(payConfig.payment_enabled ?? 'false') === 'true';
  const acModeEnabled = String(acConfig.access_code_mode_enabled ?? 'false') === 'true';

  const derivedMethod: EntryMethod = paymentEnabled
    ? 'payment'
    : acModeEnabled
      ? 'access_code'
      : 'free';

  const [entryMethod, setEntryMethod] = useState<EntryMethod>(derivedMethod);

  useEffect(() => {
    setEntryMethod(derivedMethod);
  }, [derivedMethod]);

  // ── Entry method switch mutation ──────────────────────────────
  const switchMutation = useMutation({
    mutationFn: async (method: EntryMethod) => {
      if (method === 'payment') {
        await adminApi.updateConfig('payment', { payment_enabled: 'true' });
      } else if (method === 'access_code') {
        await adminApi.updateConfig('access_code', { access_code_mode_enabled: 'true' });
      } else {
        // Free entry: disable both
        await adminApi.updateConfig('payment', { payment_enabled: 'false' });
        await adminApi.updateConfig('access_code', { access_code_mode_enabled: 'false' });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      toast.success('Entry method updated');
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Failed to update entry method');
      // Revert optimistic state
      setEntryMethod(derivedMethod);
    },
  });

  // ── Entry method confirmation modal ───────────────────────────
  const [pendingMethod, setPendingMethod] = useState<EntryMethod | null>(null);

  const ENTRY_METHOD_LABELS: Record<EntryMethod, string> = {
    free: 'Free Entry',
    payment: 'Payment',
    access_code: 'Access Code',
  };

  const handleSwitchClick = (method: EntryMethod) => {
    if (method === derivedMethod) return;
    setPendingMethod(method);
  };

  const confirmSwitch = () => {
    if (!pendingMethod) return;
    setEntryMethod(pendingMethod);
    switchMutation.mutate(pendingMethod);
    setPendingMethod(null);
  };

  // ── Payment fields state ──────────────────────────────────────
  const [provider, setProvider] = useState(String(payConfig.payment_provider ?? 'mock'));
  const [amount, setAmount] = useState(String(payConfig.payment_amount ?? 10000));
  const [serverKey, setServerKey] = useState(String(payConfig.payment_server_key ?? ''));
  const [sandbox, setSandbox] = useState(
    String(payConfig.payment_sandbox ?? 'true') === 'true',
  );

  useEffect(() => {
    if (payConfig.payment_provider) setProvider(String(payConfig.payment_provider));
    if (payConfig.payment_amount) setAmount(String(payConfig.payment_amount));
    if (payConfig.payment_server_key) setServerKey(String(payConfig.payment_server_key));
    if (payConfig.payment_sandbox !== undefined)
      setSandbox(String(payConfig.payment_sandbox) === 'true');
  }, [payConfig]);

  const savePaymentMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => adminApi.updateConfig('payment', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      toast.success('Payment configuration saved');
    },
    onError: () => toast.error('Failed to save configuration'),
  });

  const handleSavePayment = () => {
    savePaymentMutation.mutate({
      payment_provider: provider,
      payment_amount: Number(amount),
      payment_server_key: serverKey,
      payment_sandbox: sandbox,
    });
  };

  // ── Access code: generate form ────────────────────────────────
  const [codeType, setCodeType] = useState<'vibe_check' | 'photobooth' | 'universal'>('universal');
  const [count, setCount] = useState(1);
  const [maxUses, setMaxUses] = useState(1);
  const [expiryValue, setExpiryValue] = useState<number>(0);
  const [expiryUnit, setExpiryUnit] = useState<'minutes' | 'hours' | 'days'>('hours');

  const getDurationMs = (value: number, unit: string): number => {
    const msPerUnit = unit === 'minutes' ? 60_000 : unit === 'hours' ? 3_600_000 : 86_400_000;
    return value * msPerUnit;
  };

  const generateMutation = useMutation({
    mutationFn: () => {
      let parsedExpiry: string | null = null;
      if (expiryValue > 0) {
        const durationMs = getDurationMs(expiryValue, expiryUnit);
        if (durationMs < 60 * 1000) {
          toast.error('Expiration must be at least 1 minute');
          return Promise.reject();
        }
        if (durationMs > 365 * 24 * 60 * 60 * 1000) {
          toast.error('Expiration cannot exceed 365 days');
          return Promise.reject();
        }
        parsedExpiry = new Date(Date.now() + durationMs).toISOString();
      }
      return adminApi.createAccessCodes({
        code_type: codeType,
        count,
        max_uses: maxUses,
        expires_at: parsedExpiry,
        notes: null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access-codes'] });
      toast.success(`${count} access code(s) generated`);
    },
    onError: () => toast.error('Failed to generate codes'),
  });

  // ── Access code: list ─────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [page, setPage] = useState(0);
  const limit = 25;

  const { data: codesData } = useQuery({
    queryKey: ['access-codes', statusFilter, page],
    queryFn: () =>
      adminApi
        .listAccessCodes({ status: statusFilter || undefined, limit, offset: page * limit })
        .then((r) => r.data),
  });

  const codes = codesData?.codes ?? [];
  const total = codesData?.total ?? 0;

  // ── Access code: revoke / delete ──────────────────────────────
  const revokeMutation = useMutation({
    mutationFn: (codeId: number) => adminApi.revokeAccessCode(codeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access-codes'] });
      toast.success('Code revoked — it can no longer be redeemed, but the record is kept.');
    },
    onError: () => toast.error('Failed to revoke code'),
  });

  const deleteMutation = useMutation({
    mutationFn: (codeId: number) => adminApi.deleteAccessCode(codeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access-codes'] });
      toast.success('Code permanently deleted.');
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Failed to delete code');
    },
  });

  // ── Confirmation modal ────────────────────────────────────────
  const [confirmAction, setConfirmAction] = useState<{
    type: 'revoke' | 'delete';
    codeId: number;
    codeStr: string;
  } | null>(null);

  const handleConfirm = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'revoke') {
      revokeMutation.mutate(confirmAction.codeId);
    } else {
      deleteMutation.mutate(confirmAction.codeId);
    }
    setConfirmAction(null);
  };

  // ── QR modal ──────────────────────────────────────────────────
  const [qrCodeId, setQrCodeId] = useState<number | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  const handleViewQr = async (codeId: number) => {
    if (qrCodeId === codeId) {
      closeQrModal();
      return;
    }
    try {
      const res = await adminApi.getAccessCodeQr(codeId);
      const blob = new Blob([res.data as BlobPart], { type: 'image/png' });
      setQrUrl(URL.createObjectURL(blob));
      setQrCodeId(codeId);
    } catch {
      toast.error('Failed to generate QR code');
    }
  };

  const closeQrModal = () => {
    if (qrUrl) URL.revokeObjectURL(qrUrl);
    setQrCodeId(null);
    setQrUrl(null);
  };

  useEffect(() => {
    if (!qrUrl) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeQrModal();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [qrUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Code copied to clipboard');
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-500/15 text-green-300 border border-green-500/30',
      used: 'bg-blue-500/15 text-blue-300 border border-blue-500/30',
      expired: 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30',
      revoked: 'bg-red-500/15 text-red-300 border border-red-500/30',
    };
    return (
      <span
        className={`inline-block px-3.5 py-1 rounded-full text-xs font-medium tracking-wide ${styles[status] ?? 'bg-white/10 text-white/50 border border-white/10'}`}
      >
        {status}
      </span>
    );
  };

  // ── Render ────────────────────────────────────────────────────

  const formatRelativeTime = (isoDate: string | null): string => {
    if (!isoDate) return 'Never';
    const now = Date.now();
    const target = new Date(isoDate).getTime();
    const diff = target - now;
    const absDiff = Math.abs(diff);
    const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
    if (diff > 0) {
      const parts: string[] = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0) parts.push(`${hours}h`);
      if (days === 0 && mins > 0) parts.push(`${mins}m`);
      return parts.length > 0 ? parts.join(' ') + ' left' : '<1m left';
    }
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    return parts.length > 0 ? parts.join(' ') + ' ago' : 'just now';
  };

  const formatExpiryDate = (isoDate: string | null): string => {
    if (!isoDate) return '—';
    return new Date(isoDate).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isExpired = (isoDate: string | null): boolean => {
    if (!isoDate) return false;
    return new Date(isoDate).getTime() <= Date.now();
  };

  return (
    <>
      {/* Entry method selector */}
      <Card className="card-surface border-0">
        <CardHeader style={{ padding: '1.5rem' }}>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 text-violet-400" />
            <CardTitle className="font-display text-white">Entry Method</CardTitle>
          </div>
          <p className="text-xs text-white/25" style={{ marginTop: '0.5rem' }}>
            Choose how users gain access to kiosk sessions. Only one method can be active at a time.
          </p>
        </CardHeader>
        <CardContent style={{ padding: '0 2rem 2rem' }}>
          <div
            className="flex gap-1 rounded-lg bg-white/[0.03] border border-white/[0.06]"
            style={{ padding: '0.25rem', width: 'fit-content' }}
          >
            {([
              ['free', 'Free Entry', ShieldCheck],
              ['payment', 'Payment', CreditCard],
              ['access_code', 'Access Code', KeyRound],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => handleSwitchClick(value as EntryMethod)}
                disabled={switchMutation.isPending}
                className={`rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  entryMethod === value
                    ? 'bg-white/[0.08] text-violet-400'
                    : 'text-white/40 hover:text-white/60'
                }`}
                style={{ padding: '0.5rem 1.25rem' }}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Free Entry info */}
      {entryMethod === 'free' && (
        <Card className="card-surface border-0">
          <CardContent style={{ padding: '2rem' }}>
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-white/60">
                  Free entry is active. Users can start sessions without payment or access codes.
                </p>
                <p className="text-xs text-white/25" style={{ marginTop: '0.5rem' }}>
                  Switch to &ldquo;Payment&rdquo; to charge per session via QRIS, or &ldquo;Access
                  Code&rdquo; for event-hosted kiosks with pre-generated codes.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment config */}
      {entryMethod === 'payment' && (
        <Card className="card-surface border-0">
          <CardHeader style={{ padding: '1.5rem' }}>
            <div className="flex items-center gap-2.5">
              <CreditCard className="h-4 w-4 text-violet-400" />
              <CardTitle className="font-display text-white">Payment Settings</CardTitle>
            </div>
            <p className="text-xs text-white/25" style={{ marginTop: '0.5rem' }}>
              Configure QRIS payment. Users must pay before each session.
            </p>
          </CardHeader>
          <CardContent
            style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: '0 2rem 2rem' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <Label className="text-xs text-white/40 uppercase tracking-wider">Provider</Label>
              <p className="text-xs text-white/25">
                The payment gateway that processes QRIS transactions. Use Mock for testing without
                real payments.
              </p>
              <div
                className="flex gap-1 rounded-lg bg-white/[0.03] border border-white/[0.06]"
                style={{ padding: '0.25rem', width: 'fit-content' }}
              >
                {([
                  ['mock', 'Mock'],
                  ['midtrans', 'Midtrans'],
                  ['xendit', 'Xendit'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setProvider(value)}
                    className={`rounded-md text-sm font-medium transition-colors ${
                      provider === value
                        ? 'bg-white/[0.08] text-violet-400'
                        : 'text-white/40 hover:text-white/60'
                    }`}
                    style={{ padding: '0.5rem 1.25rem' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <Label className="text-xs text-white/40 uppercase tracking-wider">Amount (IDR)</Label>
              <p className="text-xs text-white/25">
                Price per session in Indonesian Rupiah. This is the amount the customer pays via
                QRIS.
              </p>
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
                <p className="text-xs text-white/25">
                  API secret key from your payment provider dashboard. Keep this confidential.
                </p>
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
                <Label className="text-xs text-white/40 uppercase tracking-wider">
                  Sandbox Mode
                </Label>
                <p className="text-xs text-white/25" style={{ marginTop: '0.25rem' }}>
                  Use the provider&apos;s test environment. No real charges will be made.
                </p>
              </div>
              <Switch checked={sandbox} onCheckedChange={setSandbox} />
            </div>
            <Button
              onClick={handleSavePayment}
              disabled={savePaymentMutation.isPending}
              className="btn-primary border-0"
              style={{ alignSelf: 'flex-start', padding: '0.75rem 1.5rem' }}
            >
              {savePaymentMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : null}
              {savePaymentMutation.isPending ? 'Saving...' : 'Save Configuration'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Access code management */}
      {entryMethod === 'access_code' && (
        <Card className="card-surface border-0">
          <CardHeader style={{ padding: '1.5rem' }}>
            <div className="flex items-center gap-2.5">
              <KeyRound className="h-4 w-4 text-violet-400" />
              <CardTitle className="font-display text-white">Access Code Management</CardTitle>
            </div>
            <p className="text-xs text-white/25" style={{ marginTop: '0.5rem' }}>
              Generate and manage access codes. Users must enter a valid code to start a session.
            </p>
          </CardHeader>
          <CardContent
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2rem',
              padding: '0 2rem 2rem',
            }}
          >
            {/* Generate form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <Label className="text-xs text-white/40 uppercase tracking-wider">
                Generate New Codes
              </Label>
              <p className="text-xs text-white/25">
                Create access codes that grant feature access. Choose a type, set quantity, and
                configure usage limits.
              </p>
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="text-xs text-white/30 block mb-1">Type</label>
                    <select
                      value={codeType}
                      onChange={(e) => setCodeType(e.target.value as typeof codeType)}
                      className="input-surface text-white text-sm rounded-lg"
                      style={{ padding: '0.5rem 0.75rem' }}
                    >
                      <option value="universal">Universal</option>
                      <option value="vibe_check">Vibe Check</option>
                      <option value="photobooth">Photobooth</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-white/30 block mb-1">Count</label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={count}
                      onChange={(e) =>
                        setCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))
                      }
                      className="input-surface text-white w-20"
                      style={{ padding: '0.5rem 0.75rem' }}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/30 block mb-1">Max Uses</label>
                    <Input
                      type="number"
                      min={1}
                      value={maxUses}
                      onChange={(e) => setMaxUses(Math.max(1, parseInt(e.target.value) || 1))}
                      className="input-surface text-white w-20"
                      style={{ padding: '0.5rem 0.75rem' }}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-white/30 block mb-1">Expires In</label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={0}
                      value={expiryValue || ''}
                      placeholder="0"
                      onChange={(e) => setExpiryValue(Math.max(0, parseInt(e.target.value) || 0))}
                      className="input-surface text-white w-20"
                      style={{ padding: '0.5rem 0.75rem' }}
                    />
                    <select
                      value={expiryUnit}
                      onChange={(e) => setExpiryUnit(e.target.value as typeof expiryUnit)}
                      className="input-surface text-white text-sm rounded-lg"
                      style={{ padding: '0.5rem 0.75rem' }}
                    >
                      <option value="minutes">Minutes</option>
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-white/20 mt-0.5">Leave 0 for no expiry.</p>
                </div>
                <Button
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                  className="btn-primary border-0"
                  style={{ padding: '0.25rem 1.0rem', alignSelf: 'flex-start' }}
                >
                  {generateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-1.5" />
                  )}
                  Generate
                </Button>
              </div>
            </div>

            {/* Filter */}
            <div className="flex items-center gap-2">
              <Label className="text-xs text-white/40 uppercase tracking-wider mr-1">Filter</Label>
              {['active', 'used', 'expired', 'revoked', ''].map((s) => (
                <button
                  key={s || 'all'}
                  onClick={() => {
                    setStatusFilter(s);
                    setPage(0);
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium tracking-wide transition-colors border ${
                    statusFilter === s
                      ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
                      : 'text-white/30 border-white/[0.06] hover:text-white/50 hover:bg-white/[0.03] hover:border-white/10'
                  }`}
                >
                  {s || 'All'}
                </button>
              ))}
            </div>

            {/* Codes table */}
            <div className="rounded-xl bg-white/[0.03] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-white/30 uppercase tracking-wider border-b border-white/[0.06]">
                    <th style={{ padding: '0.75rem 1rem' }}>Code</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Uses</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Expiry</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Created</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((code: AccessCodeResponse) => (
                    <tr
                      key={code.id}
                      className="border-b border-white/[0.03] hover:bg-white/[0.02]"
                    >
                      <td style={{ padding: '0.75rem 1rem' }} className="font-mono text-white">
                        <div className="flex items-center gap-2">
                          {code.code}
                          <button
                            onClick={() => copyCode(code.code)}
                            className="text-white/30 hover:text-white/60"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }} className="text-white/50">
                        {code.code_type}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>{statusBadge(code.status)}</td>
                      <td style={{ padding: '0.75rem 1rem' }} className="text-white/50">
                        {code.use_count}/{code.max_uses}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {code.expires_at ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-white/40 text-xs">{formatExpiryDate(code.expires_at)}</span>
                            <span className={`text-[11px] ${isExpired(code.expires_at) ? 'text-red-400/70' : 'text-emerald-400/60'}`}>
                              {formatRelativeTime(code.expires_at)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-white/25 text-xs">Never</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }} className="text-white/40">
                        {new Date(code.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div className="flex items-center gap-1">
                          {code.status === 'active' && (
                            <button
                              onClick={() =>
                                setConfirmAction({
                                  type: 'revoke',
                                  codeId: code.id,
                                  codeStr: code.code,
                                })
                              }
                              className="p-1.5 rounded-lg text-white/30 hover:text-yellow-400 hover:bg-yellow-500/10"
                              title="Revoke — disable this code so it can't be used again (record kept)"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleViewQr(code.id)}
                            className="p-1.5 rounded-lg text-white/30 hover:text-violet-400 hover:bg-violet-500/10"
                            title="View QR Code"
                          >
                            <QrCode className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              setConfirmAction({
                                type: 'delete',
                                codeId: code.id,
                                codeStr: code.code,
                              })
                            }
                            className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10"
                            title="Delete — permanently remove this code from the database"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {codes.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        style={{ padding: '2rem 1rem' }}
                        className="text-center text-white/25"
                      >
                        No access codes found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {total > limit && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/30">
                  {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                    className="text-white/40"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={(page + 1) * limit >= total}
                    onClick={() => setPage(page + 1)}
                    className="text-white/40"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Entry method switch confirmation modal */}
      {pendingMethod &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
            onClick={() => setPendingMethod(null)}
          >
            <div
              className="bg-surface-1 rounded-2xl border border-white/[0.06]"
              style={{ padding: '2rem', maxWidth: '28rem', width: '100%' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-display font-bold text-white mb-2">
                Switch Entry Method
              </h3>
              <p className="text-sm text-white/40 mb-4">
                Change entry method from{' '}
                <span className="text-white/60 font-medium">
                  {ENTRY_METHOD_LABELS[derivedMethod]}
                </span>{' '}
                to{' '}
                <span className="text-white/60 font-medium">
                  {ENTRY_METHOD_LABELS[pendingMethod]}
                </span>
                ?
              </p>
              <p className="text-sm text-white/30 mb-6">
                {pendingMethod === 'payment'
                  ? 'Users will be required to pay via QRIS before each session.'
                  : pendingMethod === 'access_code'
                    ? 'Users will need a valid access code to start a session. The previous mode will be disabled.'
                    : 'Users can start sessions without payment or access codes.'}
              </p>
              <div className="flex items-center gap-3 justify-end">
                <Button
                  variant="ghost"
                  onClick={() => setPendingMethod(null)}
                  className="text-white/40 hover:text-white/70"
                  style={{ padding: '0.5rem 1.25rem' }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmSwitch}
                  className="bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 border-0"
                  style={{ padding: '0.625rem 1.5rem' }}
                >
                  Yes, Switch
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* QR modal */}
      {qrUrl &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
            onClick={closeQrModal}
          >
            <div
              className="bg-surface-1 rounded-2xl relative"
              style={{ padding: '1.5rem' }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={closeQrModal}
                className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-surface-2 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
              <img src={qrUrl} alt="QR Code" className="w-64 h-64 rounded-lg" />
            </div>
          </div>,
          document.body,
        )}

      {/* Confirmation modal */}
      {confirmAction &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
            onClick={() => setConfirmAction(null)}
          >
            <div
              className="bg-surface-1 rounded-2xl border border-white/[0.06]"
              style={{ padding: '2rem', maxWidth: '28rem', width: '100%' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-display font-bold text-white mb-2">
                {confirmAction.type === 'revoke' ? 'Revoke Access Code' : 'Delete Access Code'}
              </h3>
              <p className="text-sm text-white/50 mb-1">
                <span className="font-mono text-white/70">{confirmAction.codeStr}</span>
              </p>
              <p className="text-sm text-white/40 mb-6">
                {confirmAction.type === 'revoke'
                  ? 'This code will no longer be accepted at the kiosk. The record stays in the list with "revoked" status for audit.'
                  : 'This will permanently remove the code from the database. This cannot be undone.'}
              </p>
              <div className="flex items-center gap-3 justify-end">
                <Button
                  variant="ghost"
                  onClick={() => setConfirmAction(null)}
                  className="text-white/40 hover:text-white/70"
                  style={{ padding: '0.5rem 1.25rem' }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirm}
                  className={`border-0 ${
                    confirmAction.type === 'revoke'
                      ? 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30'
                      : 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                  }`}
                  style={{ padding: '0.625rem 1.5rem' }}
                >
                  {confirmAction.type === 'revoke' ? 'Yes, Revoke' : 'Yes, Delete'}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
