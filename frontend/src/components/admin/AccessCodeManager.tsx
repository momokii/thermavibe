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
import { KeyRound, Loader2, Trash2, Ban, QrCode, Copy, Plus, X } from 'lucide-react';
import type { AccessCodeResponse } from '@/api/types';

export default function AccessCodeManager() {
  const queryClient = useQueryClient();

  // --- Config: access code mode toggle ---
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => adminApi.getConfig().then((r) => r.data),
  });

  const acConfig = (config?.categories?.access_code ?? {}) as Record<string, unknown>;
  const paymentConfig = (config?.categories?.payment ?? {}) as Record<string, unknown>;
  const paymentEnabled = String(paymentConfig.payment_enabled ?? 'false') === 'true';

  const [modeEnabled, setModeEnabled] = useState(false);

  useEffect(() => {
    if (acConfig.access_code_mode_enabled !== undefined) {
      setModeEnabled(String(acConfig.access_code_mode_enabled) === 'true');
    }
  }, [acConfig]);

  const toggleMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => adminApi.updateConfig('access_code', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      toast.success('Access code mode updated');
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Failed to update setting');
    },
  });

  const handleToggle = (value: boolean) => {
    if (value && paymentEnabled) {
      toast.error('Payment is currently enabled. Disabling payment to enable access code mode.');
    }
    setModeEnabled(value);
    toggleMutation.mutate({ access_code_mode_enabled: value });
  };

  // --- Generate form ---
  const [codeType, setCodeType] = useState<'vibe_check' | 'photobooth' | 'universal'>('universal');
  const [count, setCount] = useState(1);
  const [maxUses, setMaxUses] = useState(1);

  const generateMutation = useMutation({
    mutationFn: () =>
      adminApi.createAccessCodes({
        code_type: codeType,
        count,
        max_uses: maxUses,
        expires_at: null,
        notes: null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access-codes'] });
      toast.success(`${count} access code(s) generated`);
    },
    onError: () => toast.error('Failed to generate codes'),
  });

  // --- Codes list ---
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

  // --- Confirmation modal ---
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

  // --- QR modal ---
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

  // Close on Escape key
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
      <span className={`inline-block px-3.5 py-1 rounded-full text-xs font-medium tracking-wide ${styles[status] ?? 'bg-white/10 text-white/50 border border-white/10'}`}>
        {status}
      </span>
    );
  };

  const codes = codesData?.codes ?? [];
  const total = codesData?.total ?? 0;

  return (
    <>
      <Card className="card-surface border-0">
        <CardHeader style={{ padding: '1.5rem' }}>
          <div className="flex items-center gap-2.5">
            <KeyRound className="h-4 w-4 text-violet-400" />
            <CardTitle className="font-display text-white">Access Code Management</CardTitle>
          </div>
          <p className="text-xs text-white/25" style={{ marginTop: '0.5rem' }}>
            Manage access codes for event-hosted kiosk sessions. When enabled, users enter codes instead of paying per session.
          </p>
        </CardHeader>
        <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: '0 2rem 2rem' }}>
          {/* Enable toggle */}
          <div className="flex items-center justify-between" style={{ padding: '0.5rem 0' }}>
            <div>
              <Label className="text-xs text-white/40 uppercase tracking-wider">Enable Access Code Mode</Label>
              <p className="text-xs text-white/25" style={{ marginTop: '0.25rem' }}>
                Replace payment with access code entry. Mutually exclusive with payment mode — enabling this disables payment.
              </p>
            </div>
            <Switch checked={modeEnabled} onCheckedChange={handleToggle} />
          </div>

          {/* Generate form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Label className="text-xs text-white/40 uppercase tracking-wider">Generate New Codes</Label>
            <p className="text-xs text-white/25">
              Create access codes that grant feature access. Choose a type, set quantity, and configure usage limits.
            </p>
            <div className="flex flex-wrap items-end gap-3" style={{ marginTop: '0.5rem' }}>
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
                  onChange={(e) => setCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
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
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="btn-primary border-0"
                style={{ padding: '0.25rem 1.0rem' }}
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
                  <th style={{ padding: '0.75rem 1rem' }}>Created</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((code: AccessCodeResponse) => (
                  <tr key={code.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
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
                    <td style={{ padding: '0.75rem 1rem' }} className="text-white/50">{code.code_type}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{statusBadge(code.status)}</td>
                    <td style={{ padding: '0.75rem 1rem' }} className="text-white/50">
                      {code.use_count}/{code.max_uses}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }} className="text-white/40">
                      {new Date(code.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div className="flex items-center gap-1">
                        {code.status === 'active' && (
                          <button
                            onClick={() => setConfirmAction({ type: 'revoke', codeId: code.id, codeStr: code.code })}
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
                          onClick={() => setConfirmAction({ type: 'delete', codeId: code.id, codeStr: code.code })}
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
                    <td colSpan={6} style={{ padding: '2rem 1rem' }} className="text-center text-white/25">
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

      {/* QR modal — rendered as portal so it's outside the Card DOM tree */}
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

      {/* Confirmation modal for revoke/delete */}
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
