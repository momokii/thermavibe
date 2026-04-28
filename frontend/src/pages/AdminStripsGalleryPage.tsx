import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api/adminApi';
import type { StripGalleryItem } from '@/api/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ImageIcon, X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 24;

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
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<StripGalleryItem | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const offset = (page - 1) * PAGE_SIZE;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['strips', offset],
    queryFn: async () => {
      const res = await adminApi.getStrips({ limit: PAGE_SIZE, offset });
      return res.data;
    },
  });

  const strips = data?.strips ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const refresh = useCallback(() => {
    setPage(1);
    setFailedImages(new Set());
    queryClient.invalidateQueries({ queryKey: ['strips'] });
  }, [queryClient]);

  const handleImageError = useCallback((sessionId: string) => {
    setFailedImages((prev) => new Set(prev).add(sessionId));
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Strip Gallery</h1>
          <p className="text-sm text-white/40" style={{ marginTop: '0.25rem' }}>
            {total} strip{total !== 1 ? 's' : ''} captured
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

      {/* Loading */}
      {isLoading && strips.length === 0 && (
        <div className="flex items-center justify-center" style={{ padding: '4rem 0' }}>
          <Loader2 className="h-8 w-8 animate-spin text-white/30" />
        </div>
      )}

      {/* Error */}
      {isError && (
        <Card className="border-red-500/20 bg-red-500/5 p-6 text-center">
          <p className="text-red-400">Failed to load strips. Try refreshing.</p>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && !isError && strips.length === 0 && (
        <div className="flex flex-col items-center justify-center" style={{ padding: '4rem 0' }}>
          <ImageIcon className="h-12 w-12 text-white/15" />
          <p className="text-white/30 mt-4 text-sm">No strips yet</p>
          <p className="text-white/20 text-xs mt-1">Completed photobooth sessions will appear here.</p>
        </div>
      )}

      {/* Grid */}
      {strips.length > 0 && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '1rem',
            }}
          >
            {strips.map((strip) => {
              const isFailed = failedImages.has(strip.session_id);
              return (
                <button
                  key={strip.session_id}
                  type="button"
                  onClick={() => !isFailed && setSelected(strip)}
                  disabled={isFailed}
                  className="group rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden transition-all hover:border-white/[0.12] hover:bg-white/[0.04] text-left disabled:opacity-40 disabled:cursor-default"
                >
                  {/* Thumbnail */}
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
                        src={strip.thumbnail_url}
                        alt={`Strip ${strip.session_id}`}
                        className="w-full h-full object-contain"
                        loading="lazy"
                        onError={() => handleImageError(strip.session_id)}
                      />
                    )}
                  </div>
                  {/* Info */}
                  <div style={{ padding: '0.625rem 0.75rem' }}>
                    <p className="text-xs text-white/50 truncate">
                      {formatDate(strip.created_at)}
                    </p>
                    {strip.theme_name && (
                      <p className="text-xs text-white/30 truncate" style={{ marginTop: '0.125rem' }}>
                        {strip.theme_name}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

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
                          ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
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
          <p className="text-center text-xs text-white/20 mt-3">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </p>
        </>
      )}

      {/* Lightbox */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-3xl bg-surface-0 border-white/[0.08] p-0 overflow-hidden">
          <DialogTitle className="sr-only">Strip Detail</DialogTitle>
          {selected && (
            <div className="relative">
              {/* Close button */}
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="absolute top-3 right-3 z-10 rounded-full bg-black/50 p-1.5 text-white/70 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
              {/* Full composite */}
              <div
                className="bg-black/20 flex items-center justify-center"
                style={{ maxHeight: '80vh', padding: '1.5rem' }}
              >
                <img
                  src={selected.composite_url}
                  alt="Full strip"
                  className="max-h-full max-w-full object-contain rounded"
                  onError={() => {
                    handleImageError(selected.session_id);
                    setSelected(null);
                  }}
                />
              </div>
              {/* Footer info */}
              <div className="flex items-center justify-between" style={{ padding: '0.75rem 1.5rem' }}>
                <p className="text-sm text-white/60">{formatDate(selected.created_at)}</p>
                {selected.theme_name && (
                  <p className="text-sm text-white/40">{selected.theme_name}</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
