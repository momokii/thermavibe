import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/api/adminApi';
import type { StripGalleryItem, VibeCheckResultItem } from '@/api/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ImageIcon, X, Loader2, ChevronLeft, ChevronRight, Camera, Sparkles, Download, Copy, Trash2, Printer } from 'lucide-react';
import { toast } from 'sonner';

const PAGE_SIZE = 24;

type GalleryTab = 'photobooth' | 'vibe_check';

type ConfirmState = {
  type: 'delete' | 'print';
  sessionId: string;
  label: string;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminStripsGalleryPage() {
  const [tab, setTab] = useState<GalleryTab>('photobooth');
  const [page, setPage] = useState(1);
  const [selectedStrip, setSelectedStrip] = useState<StripGalleryItem | null>(null);
  const [selectedResult, setSelectedResult] = useState<VibeCheckResultItem | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<ConfirmState | null>(null);
  const [printingIds, setPrintingIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const offset = (page - 1) * PAGE_SIZE;

  const stripQuery = useQuery({
    queryKey: ['strips', offset],
    queryFn: async () => {
      const res = await adminApi.getStrips({ limit: PAGE_SIZE, offset });
      return res.data;
    },
    enabled: tab === 'photobooth',
  });

  const vibeQuery = useQuery({
    queryKey: ['vibeCheckResults', offset],
    queryFn: async () => {
      const res = await adminApi.getVibeCheckResults({ limit: PAGE_SIZE, offset });
      return res.data;
    },
    enabled: tab === 'vibe_check',
  });

  const data = tab === 'photobooth' ? stripQuery.data : vibeQuery.data;
  const isLoading = tab === 'photobooth' ? stripQuery.isLoading : vibeQuery.isLoading;
  const isError = tab === 'photobooth' ? stripQuery.isError : vibeQuery.isError;

  const strips = stripQuery.data?.strips ?? [];
  const results = vibeQuery.data?.results ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const refresh = useCallback(() => {
    setPage(1);
    setFailedImages(new Set());
    if (tab === 'photobooth') {
      queryClient.invalidateQueries({ queryKey: ['strips'] });
    } else {
      queryClient.invalidateQueries({ queryKey: ['vibeCheckResults'] });
    }
  }, [queryClient, tab]);

  const handleTabChange = (newTab: GalleryTab) => {
    setTab(newTab);
    setPage(1);
    setFailedImages(new Set());
    setSelectedStrip(null);
    setSelectedResult(null);
  };

  const handleImageError = useCallback((id: string) => {
    setFailedImages((prev) => new Set(prev).add(id));
  }, []);

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => adminApi.deleteGalleryItem(sessionId),
    onSuccess: () => {
      toast.success('Photo deleted permanently');
      if (selectedStrip?.session_id === confirmAction?.sessionId) setSelectedStrip(null);
      if (selectedResult?.session_id === confirmAction?.sessionId) setSelectedResult(null);
      setConfirmAction(null);
      refresh();
    },
    onError: () => {
      toast.error('Failed to delete photo');
    },
  });

  const handlePrint = useCallback(async (sessionId: string) => {
    setPrintingIds((prev) => new Set(prev).add(sessionId));
    setConfirmAction(null);
    try {
      const res = await adminApi.printGalleryItem(sessionId);
      toast.success(res.data.message || 'Print sent');
    } catch {
      toast.error('Print failed — is the printer connected?');
    } finally {
      setPrintingIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  }, []);

  const requestDelete = useCallback((sessionId: string, label: string) => {
    setConfirmAction({ type: 'delete', sessionId, label });
  }, []);

  const requestPrint = useCallback((sessionId: string, label: string) => {
    setConfirmAction({ type: 'print', sessionId, label });
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Gallery</h1>
          <p className="text-sm text-white/40" style={{ marginTop: '0.25rem' }}>
            {total} item{total !== 1 ? 's' : ''} captured
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          className="!px-8 border-white/10 text-white/60 hover:text-white"
        >
          Refresh
        </Button>
      </div>

      {/* Tab toggle */}
      <div
        className="flex gap-1 rounded-lg bg-white/[0.03] border border-white/[0.06]"
        style={{ marginBottom: '1.5rem', width: 'fit-content', padding: '0.25rem' }}
      >
        <button
          type="button"
          onClick={() => handleTabChange('photobooth')}
          className={`flex items-center gap-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'photobooth'
              ? 'bg-white/[0.08] text-white'
              : 'text-white/40 hover:text-white/60'
          }`}
          style={{ padding: '0.5rem 1.25rem' }}
        >
          <Camera className="h-4 w-4" />
          Photobooth
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('vibe_check')}
          className={`flex items-center gap-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'vibe_check'
              ? 'bg-white/[0.08] text-violet-400'
              : 'text-white/40 hover:text-white/60'
          }`}
          style={{ padding: '0.5rem 1.25rem' }}
        >
          <Sparkles className="h-4 w-4" />
          Vibe Check
        </button>
      </div>

      {/* Loading */}
      {isLoading && (tab === 'photobooth' ? strips.length === 0 : results.length === 0) && (
        <div className="flex items-center justify-center" style={{ padding: '4rem 0' }}>
          <Loader2 className="h-8 w-8 animate-spin text-white/30" />
        </div>
      )}

      {/* Error */}
      {isError && (
        <Card className="border-red-500/20 bg-red-500/5 p-6 text-center">
          <p className="text-red-400">Failed to load gallery. Try refreshing.</p>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && !isError && ((tab === 'photobooth' && strips.length === 0) || (tab === 'vibe_check' && results.length === 0)) && (
        <div className="flex flex-col items-center justify-center" style={{ padding: '4rem 0' }}>
          <ImageIcon className="h-12 w-12 text-white/15" />
          <p className="text-white/30 mt-4 text-sm">
            {tab === 'photobooth' ? 'No strips yet' : 'No vibe check results yet'}
          </p>
          <p className="text-white/20 text-xs mt-1">
            {tab === 'photobooth'
              ? 'Completed photobooth sessions will appear here.'
              : 'Completed vibe check sessions with AI readings will appear here.'}
          </p>
        </div>
      )}

      {/* Photobooth grid */}
      {tab === 'photobooth' && strips.length > 0 && (
        <GalleryGrid
          items={strips}
          failedImages={failedImages}
          onImageError={handleImageError}
          onSelect={(strip) => setSelectedStrip(strip)}
          onDelete={(item) => requestDelete(item.session_id, `strip from ${formatDate(item.created_at)}`)}
          onPrint={(item) => requestPrint(item.session_id, `strip from ${formatDate(item.created_at)}`)}
          printingIds={printingIds}
          renderInfo={(strip) => (
            <>
              <p className="text-xs text-white/50 truncate">{formatDate(strip.created_at)}</p>
              {strip.theme_name && (
                <p className="text-xs text-white/30 truncate" style={{ marginTop: '0.125rem' }}>
                  {strip.theme_name}
                </p>
              )}
            </>
          )}
        />
      )}

      {/* Vibe Check grid */}
      {tab === 'vibe_check' && results.length > 0 && (
        <GalleryGrid
          items={results}
          failedImages={failedImages}
          onImageError={handleImageError}
          onSelect={(result) => setSelectedResult(result)}
          onDelete={(item) => requestDelete(item.session_id, `vibe check from ${formatDate(item.created_at)}`)}
          onPrint={(item) => requestPrint(item.session_id, `vibe check from ${formatDate(item.created_at)}`)}
          printingIds={printingIds}
          renderInfo={(result) => (
            <>
              <p className="text-xs text-white/50 truncate">{formatDate(result.created_at)}</p>
              {result.analysis_text && (
                <p className="text-xs text-white/30 truncate" style={{ marginTop: '0.125rem' }}>
                  {result.analysis_text.slice(0, 80)}...
                </p>
              )}
            </>
          )}
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          className="flex items-center justify-center gap-4"
          style={{ marginTop: '2rem' }}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isLoading}
            className="border-white/10 text-white/60 hover:text-white gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          <div className="flex items-center gap-1">
            {generatePageNumbers(page, totalPages).map((p, i) =>
              p === '...' ? (
                <span key={`ellipsis-${i}`} className="px-2 text-white/20 text-sm select-none">
                  ...
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p as number)}
                  className={`min-w-[2rem] h-8 rounded-md text-sm font-medium transition-colors ${
                    page === p
                      ? tab === 'photobooth'
                        ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                        : 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                      : 'text-white/40 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {p}
                </button>
              ),
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isLoading}
            className="border-white/10 text-white/60 hover:text-white gap-1"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Summary */}
      {((tab === 'photobooth' && strips.length > 0) || (tab === 'vibe_check' && results.length > 0)) && (
        <p className="text-center text-xs text-white/20" style={{ marginTop: '1.5rem' }}>
          Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
        </p>
      )}

      {/* Photobooth lightbox */}
      <Dialog open={!!selectedStrip} onOpenChange={(open) => { if (!open && !confirmAction) setSelectedStrip(null); }}>
        <DialogContent className="max-w-lg bg-surface-0 border-white/[0.08] p-0 overflow-hidden">
          <DialogTitle className="sr-only">Strip Detail</DialogTitle>
          {selectedStrip && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSelectedStrip(null)}
                className="absolute top-3 right-3 z-10 rounded-full bg-black/50 p-1.5 text-white/70 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
              <div
                className="bg-black/20 flex items-center justify-center"
                style={{ padding: '1.5rem' }}
              >
                <img
                  src={selectedStrip.composite_url}
                  alt="Full strip"
                  className="w-full h-auto rounded"
                  style={{ maxHeight: '75vh', objectFit: 'contain' }}
                  onError={() => {
                    handleImageError(selectedStrip.session_id);
                    setSelectedStrip(null);
                  }}
                />
              </div>
              <div className="flex items-center justify-between" style={{ padding: '0.75rem 1.5rem' }}>
                <div className="flex items-center gap-3">
                  <p className="text-sm text-white/60">{formatDate(selectedStrip.created_at)}</p>
                  {selectedStrip.theme_name && (
                    <p className="text-sm text-white/40">{selectedStrip.theme_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => requestPrint(selectedStrip.session_id, `strip from ${formatDate(selectedStrip.created_at)}`)}
                    disabled={printingIds.has(selectedStrip.session_id)}
                    className="flex items-center gap-2 rounded-lg text-sm font-medium text-white/50 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] transition-colors disabled:opacity-40"
                    style={{ padding: '0.5rem 1rem' }}
                  >
                    {printingIds.has(selectedStrip.session_id) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Printer className="h-4 w-4" />
                    )}
                    Print
                  </button>
                  <a
                    href={selectedStrip.composite_url}
                    download
                    className="flex items-center gap-2 rounded-lg text-sm font-medium text-white/50 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] transition-colors"
                    style={{ padding: '0.5rem 1rem' }}
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={() => requestDelete(selectedStrip.session_id, `strip from ${formatDate(selectedStrip.created_at)}`)}
                    className="flex items-center gap-2 rounded-lg text-sm font-medium text-red-400/60 hover:text-red-400 bg-red-500/[0.06] hover:bg-red-500/[0.12] transition-colors"
                    style={{ padding: '0.5rem 1rem' }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* In-dialog confirmation overlay */}
          {confirmAction && selectedStrip && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20 rounded-lg">
              <ConfirmOverlay
                confirmAction={confirmAction}
                onCancel={() => setConfirmAction(null)}
                onConfirmDelete={() => deleteMutation.mutate(confirmAction.sessionId)}
                onConfirmPrint={() => handlePrint(confirmAction.sessionId)}
                isDeleting={deleteMutation.isPending}
                isPrinting={printingIds.has(confirmAction.sessionId)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Vibe Check lightbox */}
      <Dialog open={!!selectedResult} onOpenChange={(open) => { if (!open && !confirmAction) setSelectedResult(null); }}>
        <DialogContent className="max-w-2xl bg-surface-0 border-white/[0.08] p-0 overflow-hidden">
          <DialogTitle className="sr-only">Vibe Check Result</DialogTitle>
          {selectedResult && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSelectedResult(null)}
                className="absolute top-3 right-3 z-10 rounded-full bg-black/50 p-1.5 text-white/70 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex flex-col md:flex-row">
                {/* Photo */}
                <div
                  className="bg-black/20 flex items-center justify-center md:w-1/2"
                  style={{ padding: '1.5rem' }}
                >
                  <img
                    src={selectedResult.photo_url}
                    alt="Vibe check photo"
                    className="max-h-full max-w-full object-contain rounded"
                    style={{ maxHeight: '60vh' }}
                    onError={() => {
                      handleImageError(selectedResult.session_id);
                      setSelectedResult(null);
                    }}
                  />
                </div>
                {/* AI analysis */}
                <div className="md:w-1/2 flex flex-col" style={{ padding: '1.5rem' }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: '1rem' }}>
                    <Sparkles className="h-4 w-4 text-violet-400" />
                    <span className="text-sm font-medium text-white/70">AI Vibe Reading</span>
                  </div>
                  <div className="flex-1 overflow-y-auto" style={{ marginBottom: '1.5rem' }}>
                    {selectedResult.analysis_text ? (
                      <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">
                        {selectedResult.analysis_text}
                      </p>
                    ) : (
                      <p className="text-sm text-white/30 italic">No analysis available</p>
                    )}
                  </div>
                  {/* Footer with separator */}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <p className="text-xs text-white/30">{formatDate(selectedResult.created_at)}</p>
                        {selectedResult.analysis_provider && (
                          <p className="text-xs text-white/20">via {selectedResult.analysis_provider}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => requestPrint(selectedResult.session_id, `vibe check from ${formatDate(selectedResult.created_at)}`)}
                          disabled={printingIds.has(selectedResult.session_id)}
                          className="flex items-center gap-2 rounded-lg text-sm font-medium text-white/50 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] transition-colors disabled:opacity-40"
                          style={{ padding: '0.5rem 0.75rem' }}
                        >
                          {printingIds.has(selectedResult.session_id) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Printer className="h-4 w-4" />
                          )}
                          Print
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedResult.analysis_text) {
                              navigator.clipboard.writeText(selectedResult.analysis_text);
                              toast.success('Vibe reading copied to clipboard');
                            }
                          }}
                          className="flex items-center gap-2 rounded-lg text-sm font-medium text-white/50 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] transition-colors"
                          style={{ padding: '0.5rem 0.75rem' }}
                        >
                          <Copy className="h-4 w-4" />
                          Copy
                        </button>
                        <a
                          href={selectedResult.photo_url}
                          download
                          className="flex items-center gap-2 rounded-lg text-sm font-medium text-white/50 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] transition-colors"
                          style={{ padding: '0.5rem 0.75rem' }}
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </a>
                        <button
                          type="button"
                          onClick={() => requestDelete(selectedResult.session_id, `vibe check from ${formatDate(selectedResult.created_at)}`)}
                          className="flex items-center gap-2 rounded-lg text-sm font-medium text-red-400/60 hover:text-red-400 bg-red-500/[0.06] hover:bg-red-500/[0.12] transition-colors"
                          style={{ padding: '0.5rem 0.75rem' }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* In-dialog confirmation overlay */}
          {confirmAction && selectedResult && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20 rounded-lg">
              <ConfirmOverlay
                confirmAction={confirmAction}
                onCancel={() => setConfirmAction(null)}
                onConfirmDelete={() => deleteMutation.mutate(confirmAction.sessionId)}
                onConfirmPrint={() => handlePrint(confirmAction.sessionId)}
                isDeleting={deleteMutation.isPending}
                isPrinting={printingIds.has(confirmAction.sessionId)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Standalone confirmation modal (from grid cards, no lightbox open) */}
      {confirmAction && !selectedStrip && !selectedResult && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
          <div
            className="bg-surface-1 rounded-2xl border border-white/[0.06] shadow-2xl"
            style={{ width: '100%', maxWidth: '400px', padding: '1.5rem' }}
          >
            <ConfirmOverlay
              confirmAction={confirmAction}
              onCancel={() => setConfirmAction(null)}
              onConfirmDelete={() => deleteMutation.mutate(confirmAction.sessionId)}
              onConfirmPrint={() => handlePrint(confirmAction.sessionId)}
              isDeleting={deleteMutation.isPending}
              isPrinting={printingIds.has(confirmAction.sessionId)}
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Reusable confirmation overlay content for delete/print actions. */
function ConfirmOverlay({
  confirmAction,
  onCancel,
  onConfirmDelete,
  onConfirmPrint,
  isDeleting,
  isPrinting,
}: {
  confirmAction: ConfirmState;
  onCancel: () => void;
  onConfirmDelete: () => void;
  onConfirmPrint: () => void;
  isDeleting: boolean;
  isPrinting: boolean;
}) {
  if (confirmAction.type === 'delete') {
    return (
      <>
        <h3 className="text-lg font-semibold text-white">Delete Photo</h3>
        <p className="text-sm text-white/50 mt-2">
          This will permanently delete the <span className="text-white/70">{confirmAction.label}</span> and cannot be undone.
        </p>
        <div className="flex items-center justify-end gap-3 mt-8">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isDeleting}
            className="border-white/10 text-white/60 hover:text-white !px-6"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onConfirmDelete}
            disabled={isDeleting}
            className="bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 !px-6"
          >
            {isDeleting ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Deleting...</>
            ) : (
              'Delete permanently'
            )}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <h3 className="text-lg font-semibold text-white">Print Photo</h3>
      <p className="text-sm text-white/50 mt-2">
        Send the <span className="text-white/70">{confirmAction.label}</span> to the thermal printer?
      </p>
      <div className="flex items-center justify-end gap-3 mt-8">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isPrinting}
          className="border-white/10 text-white/60 hover:text-white !px-6"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={onConfirmPrint}
          disabled={isPrinting}
          className="bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/30 !px-6"
        >
          {isPrinting ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Printing...</>
          ) : (
            <><Printer className="h-4 w-4 mr-2" /> Print now</>
          )}
        </Button>
      </div>
    </>
  );
}

/** Shared grid layout for both gallery types. */
function GalleryGrid<T extends { session_id: string; thumbnail_url: string }>({
  items,
  failedImages,
  onImageError,
  onSelect,
  onDelete,
  onPrint,
  printingIds,
  renderInfo,
}: {
  items: T[];
  failedImages: Set<string>;
  onImageError: (id: string) => void;
  onSelect: (item: T) => void;
  onDelete: (item: T) => void;
  onPrint: (item: T) => void;
  printingIds: Set<string>;
  renderInfo: (item: T) => React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '1rem',
      }}
    >
      {items.map((item) => {
        const isFailed = failedImages.has(item.session_id);
        const isPrinting = printingIds.has(item.session_id);
        return (
          <div
            key={item.session_id}
            className="group rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden transition-all hover:border-white/[0.12] hover:bg-white/[0.04]"
          >
            <button
              type="button"
              onClick={() => !isFailed && onSelect(item)}
              disabled={isFailed}
              className="w-full text-left disabled:opacity-40 disabled:cursor-default"
            >
              <div
                className="relative bg-white/[0.03]"
                style={{ aspectRatio: '3/4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {isFailed ? (
                  <div className="flex flex-col items-center gap-2">
                    <ImageIcon className="h-8 w-8 text-white/15" />
                    <span className="text-[10px] text-white/20">Image expired</span>
                  </div>
                ) : (
                  <img
                    src={item.thumbnail_url}
                    alt={`Item ${item.session_id}`}
                    className="w-full h-full object-contain"
                    loading="lazy"
                    onError={() => onImageError(item.session_id)}
                  />
                )}
              </div>
              <div style={{ padding: '0.625rem 0.75rem' }}>
                {renderInfo(item)}
              </div>
            </button>
            {/* Action row */}
            {!isFailed && (
              <div
                className="flex items-center border-t border-white/[0.04]"
                style={{ padding: '0.375rem 0.5rem' }}
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onPrint(item); }}
                  disabled={isPrinting}
                  className="flex items-center gap-1.5 rounded-md text-xs text-white/40 hover:text-white/80 bg-white/[0.04] hover:bg-white/[0.08] transition-colors disabled:opacity-40"
                  style={{ padding: '0.3rem 0.6rem' }}
                  title="Print"
                >
                  {isPrinting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                  Print
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(item); }}
                  className="flex items-center gap-1.5 rounded-md text-xs text-red-400/50 hover:text-red-400 bg-red-500/[0.04] hover:bg-red-500/[0.1] transition-colors"
                  style={{ padding: '0.3rem 0.6rem' }}
                  title="Delete permanently"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Generate a windowed page number array with ellipsis. */
function generatePageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | '...')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('...');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push('...');
  pages.push(total);
  return pages;
}
