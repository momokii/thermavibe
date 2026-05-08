import { useState, useCallback } from 'react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Download, FileText, Table2, Loader2 } from 'lucide-react';
import { generateAnalyticsCsv, generateAnalyticsPdf, downloadBlob } from '@/lib/export';
import type { ExportDataBundle } from '@/lib/export';

function buildFilename(data: ExportDataBundle, ext: string): string {
  const start = data.startDate.slice(0, 10);
  const end = data.endDate.slice(0, 10);
  return `vibeprint-analytics-${data.rangeLabel}-${start}-to-${end}.${ext}`;
}

export default function AnalyticsExportButton({ data }: { data: ExportDataBundle }) {
  const [isExporting, setIsExporting] = useState(false);

  const hasData = !!data.sessions?.summary;

  const exportCsv = useCallback(() => {
    const csv = generateAnalyticsCsv(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, buildFilename(data, 'csv'));
  }, [data]);

  const exportPdf = useCallback(() => {
    setIsExporting(true);
    setTimeout(() => {
      try {
        const doc = generateAnalyticsPdf(data);
        doc.save(buildFilename(data, 'pdf'));
      } finally {
        setIsExporting(false);
      }
    }, 0);
  }, [data]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasData || isExporting}
          className="border-white/10 text-white/60 hover:text-white gap-2"
        >
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-surface-1 border-white/10">
        <DropdownMenuItem onClick={exportCsv} disabled={isExporting} className="text-white/70 focus:text-white focus:bg-white/[0.06] cursor-pointer">
          <Table2 className="h-4 w-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportPdf} disabled={isExporting} className="text-white/70 focus:text-white focus:bg-white/[0.06] cursor-pointer">
          <FileText className="h-4 w-4 mr-2" />
          Export as PDF Report
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
