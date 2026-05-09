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
  RefreshCw,
  Printer,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { AccessCodeResponse, AccessCodeSummaryResponse } from '@/api/types';
import { formatIDR } from '@/lib/formatters';

type EntryMethod = 'free' | 'payment' | 'access_code';

function AccessCodeSummary({ stats }: { stats: AccessCodeSummaryResponse }) {
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02]" style={{ padding: '0.75rem 1rem' }}>
        <p className="text-xs text-white/30">Total Codes</p>
        <p className="text-lg font-display font-bold text-white tabular-nums">{stats.total_codes}</p>
        <p className="text-xs text-white/20">{stats.active_codes} active · {stats.used_codes} fully used</p>
      </div>
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02]" style={{ padding: '0.75rem 1rem' }}>
        <p className="text-xs text-white/30">Total Redemptions</p>
        <p className="text-lg font-display font-bold text-white tabular-nums">{stats.total_redemptions}</p>
        <p className="text-xs text-white/20">Across all codes</p>
      </div>
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02]" style={{ padding: '0.75rem 1rem' }}>
        <p className="text-xs text-white/30">Redemption Rate</p>
        <p className="text-lg font-display font-bold text-white">{(stats.redemption_rate * 100).toFixed(1)}%</p>
        <p className="text-xs text-white/20">Uses vs max allowed uses</p>
      </div>
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02]" style={{ padding: '0.75rem 1rem' }}>
        <p className="text-xs text-white/30">Est. Revenue</p>
        <p className="text-lg font-display font-bold text-white">{formatIDR(stats.estimated_revenue)}</p>
        <p className="text-xs text-white/20">From priced codes × redemptions</p>
      </div>
    </div>
  );
}

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
  const [codePrice, setCodePrice] = useState<string>('');

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
        price: codePrice ? parseInt(codePrice) : null,
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
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Summary stats from backend aggregation
  const { data: summaryStats } = useQuery({
    queryKey: ['access-codes-summary'],
    queryFn: () => adminApi.getAccessCodeSummary().then((r) => r.data),
  });

  // Filtered + paginated query for the table
  const { data: codesData, refetch: refetchCodes } = useQuery({
    queryKey: ['access-codes', statusFilter, typeFilter, page, limit],
    queryFn: () =>
      adminApi
        .listAccessCodes({
          status: statusFilter || undefined,
          code_type: typeFilter || undefined,
          limit,
          offset: page * limit,
        })
        .then((r) => r.data),
  });

  const codes = codesData?.codes ?? [];
  const total = codesData?.total ?? 0;

  // Client-side search filter on current page
  const filteredCodes = debouncedSearch
    ? codes.filter((c) => c.code.toLowerCase().includes(debouncedSearch.toLowerCase()))
    : codes;

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

  const printCodeMutation = useMutation({
    mutationFn: (codeId: number) => adminApi.printAccessCode(codeId),
    onSuccess: () => {
      toast.success('Code sent to printer');
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Print failed — is the printer connected?');
    },
  });

  // ── Confirmation modal ────────────────────────────────────────
  const [confirmAction, setConfirmAction] = useState<{
    type: 'revoke' | 'delete' | 'print';
    codeId: number;
    codeStr: string;
    codeDetails?: AccessCodeResponse;
  } | null>(null);

  const handleConfirm = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'revoke') {
      revokeMutation.mutate(confirmAction.codeId);
    } else if (confirmAction.type === 'print') {
      printCodeMutation.mutate(confirmAction.codeId);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
                  <div>
                    <label className="text-xs text-white/30 block mb-1">Price (IDR)</label>
                    <Input
                      type="number"
                      min={0}
                      placeholder={String(payConfig.payment_amount ?? 5000)}
                      value={codePrice}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d+$/.test(val)) {
                          setCodePrice(val);
                        }
                      }}
                      className="input-surface text-white w-28"
                      style={{ padding: '0.5rem 0.75rem' }}
                    />
                    <p className="text-[10px] text-white/20 mt-0.5">
                      Per redemption. Leave empty for default ({String(payConfig.payment_amount ?? 5000)} IDR).
                    </p>
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

            {/* Redemption Summary */}
            {summaryStats && (
              <AccessCodeSummary stats={summaryStats} />
            )}

            {/* Search + Filters + Refresh */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]" style={{ padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                {/* Top row: search + refresh */}
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25" />
                    <input
                      type="text"
                      placeholder="Search codes..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="input-surface text-white text-sm w-full"
                      style={{ padding: '0.5rem 2rem 0.5rem 2.25rem' }}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => { setSearchQuery(''); setDebouncedSearch(''); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refetchCodes()}
                    className="text-white/40 hover:text-white/70 gap-1.5 shrink-0"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                  </Button>
                </div>
                {/* Filter rows */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {/* Status */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-white/50 font-semibold uppercase tracking-wider mr-0.5">Status</span>
                    {['active', 'used', 'expired', 'revoked', ''].map((s) => (
                      <button
                        key={s || 'all'}
                        onClick={() => {
                          setStatusFilter(s);
                          setPage(0);
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          statusFilter === s
                            ? 'bg-violet-500/15 text-violet-300'
                            : 'text-white/25 hover:text-white/50 hover:bg-white/[0.04]'
                        }`}
                      >
                        {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
                      </button>
                    ))}
                  </div>
                  {/* Divider */}
                  <div className="w-px h-4 bg-white/[0.08]" />
                  {/* Type */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-white/50 font-semibold uppercase tracking-wider mr-0.5">Type</span>
                    {[
                      { value: '', label: 'All' },
                      { value: 'universal', label: 'Universal' },
                      { value: 'vibe_check', label: 'Vibe Check' },
                      { value: 'photobooth', label: 'Photobooth' },
                    ].map((t) => (
                      <button
                        key={t.value || 'all'}
                        onClick={() => {
                          setTypeFilter(t.value);
                          setPage(0);
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          typeFilter === t.value
                            ? 'bg-cyan-500/15 text-cyan-300'
                            : 'text-white/25 hover:text-white/50 hover:bg-white/[0.04]'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Codes table */}
            <div className="rounded-xl bg-white/[0.03] overflow-x-auto custom-scrollbar">
              <table className="w-full text-sm" style={{ minWidth: '900px' }}>
                <thead>
                  <tr className="text-left text-xs text-white/30 uppercase tracking-wider border-b border-white/[0.06]">
                    <th style={{ padding: '0.75rem 1rem' }}>Code</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Price</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Uses</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Expiry</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Created</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCodes.map((code: AccessCodeResponse) => (
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
                      <td style={{ padding: '0.75rem 1rem' }} className="text-white/50">
                        {code.price != null
                          ? `Rp ${code.price.toLocaleString('id-ID')}`
                          : <span className="text-white/25">—</span>}
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
                            <>
                              <button
                                onClick={() =>
                                  setConfirmAction({
                                    type: 'print',
                                    codeId: code.id,
                                    codeStr: code.code,
                                    codeDetails: code,
                                  })
                                }
                                className="p-1.5 rounded-lg text-white/30 hover:text-emerald-400 hover:bg-emerald-500/10"
                                title="Print code receipt"
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </button>
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
                            </>
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
                  {filteredCodes.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
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
            {total > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white/30">
                    {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-white/25">Per page</span>
                    {[10, 25, 50].map((n) => (
                      <button
                        key={n}
                        onClick={() => { setLimit(n); setPage(0); }}
                        className={`px-2 py-0.5 rounded text-xs transition-colors ${
                          limit === n
                            ? 'bg-white/[0.08] text-white/70'
                            : 'text-white/25 hover:text-white/50'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                    className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.04] disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {(() => {
                    const totalPages = Math.ceil(total / limit);
                    const pages: (number | '...')[] = [];
                    if (totalPages <= 7) {
                      for (let i = 0; i < totalPages; i++) pages.push(i);
                    } else {
                      pages.push(0);
                      if (page > 2) pages.push('...');
                      const start = Math.max(1, page - 1);
                      const end = Math.min(totalPages - 2, page + 1);
                      for (let i = start; i <= end; i++) pages.push(i);
                      if (page < totalPages - 3) pages.push('...');
                      pages.push(totalPages - 1);
                    }
                    return pages.map((p, i) =>
                      p === '...' ? (
                        <span key={`ellipsis-${i}`} className="px-1 text-xs text-white/20">...</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={`min-w-[28px] h-7 rounded-lg text-xs font-medium transition-colors ${
                            page === p
                              ? 'bg-violet-500/15 text-violet-300'
                              : 'text-white/30 hover:text-white/60 hover:bg-white/[0.04]'
                          }`}
                        >
                          {p + 1}
                        </button>
                      ),
                    );
                  })()}
                  <button
                    disabled={(page + 1) * limit >= total}
                    onClick={() => setPage(page + 1)}
                    className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.04] disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>

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
              style={{ padding: '2rem', maxWidth: '32rem', width: '100%' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-display font-bold text-white mb-2">
                {confirmAction.type === 'print'
                  ? 'Print Access Code'
                  : confirmAction.type === 'revoke'
                    ? 'Revoke Access Code'
                    : 'Delete Access Code'}
              </h3>
              <p className="text-sm text-white/50 mb-1">
                <span className="font-mono text-white/70">{confirmAction.codeStr}</span>
              </p>

              {/* Print preview details */}
              {confirmAction.type === 'print' && confirmAction.codeDetails && (
                <div
                  className="rounded-lg border border-white/[0.06] bg-white/[0.02] mt-3 mb-4"
                  style={{ padding: '0.75rem 1rem' }}
                >
                  <p className="text-[11px] text-white/25 uppercase tracking-wider mb-2">Receipt Preview</p>
                  <div className="grid grid-cols-2 gap-y-1.5 text-sm">
                    <span className="text-white/30">Type</span>
                    <span className="text-white/60">
                      {({ vibe_check: 'Vibe Check', photobooth: 'Photobooth' } as Record<string, string>)[confirmAction.codeDetails.code_type] ?? 'Universal'}
                    </span>
                    <span className="text-white/30">Price</span>
                    <span className="text-white/60">
                      {confirmAction.codeDetails.price != null
                        ? `Rp ${confirmAction.codeDetails.price.toLocaleString('id-ID')}`
                        : 'Free'}
                    </span>
                    <span className="text-white/30">Uses</span>
                    <span className="text-white/60">
                      {confirmAction.codeDetails.use_count} / {confirmAction.codeDetails.max_uses}
                    </span>
                    <span className="text-white/30">Expires</span>
                    <span className="text-white/60">
                      {confirmAction.codeDetails.expires_at
                        ? <>
                            {formatExpiryDate(confirmAction.codeDetails.expires_at)}
                            <span className={`ml-1.5 text-[11px] ${isExpired(confirmAction.codeDetails.expires_at) ? 'text-red-400/70' : 'text-emerald-400/60'}`}>
                              ({formatRelativeTime(confirmAction.codeDetails.expires_at)})
                            </span>
                          </>
                        : 'Never'}
                    </span>
                  </div>
                </div>
              )}

              <p className="text-sm text-white/40 mb-6">
                {confirmAction.type === 'print'
                  ? 'Send this access code to the thermal printer? The receipt will include the code, type, price, and expiry information shown above.'
                  : confirmAction.type === 'revoke'
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
                  disabled={confirmAction.type === 'print' && printCodeMutation.isPending}
                  className={`border-0 ${
                    confirmAction.type === 'print'
                      ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                      : confirmAction.type === 'revoke'
                        ? 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30'
                        : 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                  }`}
                  style={{ padding: '0.625rem 1.5rem' }}
                >
                  {confirmAction.type === 'print' && printCodeMutation.isPending
                    ? 'Printing...'
                    : confirmAction.type === 'print'
                      ? 'Print Now'
                      : confirmAction.type === 'revoke'
                        ? 'Yes, Revoke'
                        : 'Yes, Delete'}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
