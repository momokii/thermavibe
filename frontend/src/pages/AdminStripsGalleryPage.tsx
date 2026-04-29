import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api/adminApi';
import type { StripGalleryItem, VibeCheckResultItem } from '@/api/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ImageIcon, X, Loader2, ChevronLeft, ChevronRight, Camera, Sparkles, Download } from 'lucide-react';

const PAGE_SIZE = 24;

type GalleryTab = 'photobooth' | 'vibe_check';

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
      <Dialog open={!!selectedStrip} onOpenChange={(open) => !open && setSelectedStrip(null)}>
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
                <a
                  href={selectedStrip.composite_url}
                  download
                  className="flex items-center gap-2 rounded-lg text-sm font-medium text-white/50 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] transition-colors"
                  style={{ padding: '0.5rem 1rem' }}
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Vibe Check lightbox */}
      <Dialog open={!!selectedResult} onOpenChange={(open) => !open && setSelectedResult(null)}>
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
                  style={{ maxHeight: '60vh', padding: '1.5rem' }}
                >
                  <img
                    src={selectedResult.photo_url}
                    alt="Vibe check photo"
                    className="max-h-full max-w-full object-contain rounded"
                    onError={() => {
                      handleImageError(selectedResult.session_id);
                      setSelectedResult(null);
                    }}
                  />
                </div>
                {/* AI analysis */}
                <div className="md:w-1/2 flex flex-col" style={{ padding: '1.5rem' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-4 w-4 text-violet-400" />
                    <span className="text-sm font-medium text-white/70">AI Vibe Reading</span>
                  </div>
                  {selectedResult.analysis_text ? (
                    <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">
                      {selectedResult.analysis_text}
                    </p>
                  ) : (
                    <p className="text-sm text-white/30 italic">No analysis available</p>
                  )}
                  <div className="mt-auto pt-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-white/30">{formatDate(selectedResult.created_at)}</p>
                      {selectedResult.analysis_provider && (
                        <p className="text-xs text-white/20">via {selectedResult.analysis_provider}</p>
                      )}
                    </div>
                    <a
                      href={selectedResult.photo_url}
                      download
                      className="flex items-center gap-2 rounded-lg text-sm font-medium text-white/50 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] transition-colors"
                      style={{ padding: '0.5rem 1rem' }}
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Shared grid layout for both gallery types. */
function GalleryGrid<T extends { session_id: string; thumbnail_url: string }>({
  items,
  failedImages,
  onImageError,
  onSelect,
  renderInfo,
}: {
  items: T[];
  failedImages: Set<string>;
  onImageError: (id: string) => void;
  onSelect: (item: T) => void;
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
        return (
          <button
            key={item.session_id}
            type="button"
            onClick={() => !isFailed && onSelect(item)}
            disabled={isFailed}
            className="group rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden transition-all hover:border-white/[0.12] hover:bg-white/[0.04] text-left disabled:opacity-40 disabled:cursor-default"
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
