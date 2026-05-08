import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ExportDataBundle } from './types';
import { formatPercent, formatDuration, formatIDR, formatPeriod } from '@/lib/formatters';

const DARK = '#0f0f14';
const DARK_HEADER = '#1a1a2e';
const LIGHT_GRAY = '#f5f5f5';
const TEXT_DARK = '#333333';
const WHITE = '#ffffff';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function addReportHeader(doc: jsPDF, data: ExportDataBundle): void {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(DARK);
  doc.rect(0, 0, w, 38, 'F');

  doc.setTextColor(WHITE);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('VibePrint OS', 14, 16);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Analytics Report', 14, 24);

  doc.setFontSize(9);
  doc.setTextColor(200, 200, 210);
  doc.text(`${data.rangeLabel}: ${data.startDate.slice(0, 10)} to ${data.endDate.slice(0, 10)}`, 14, 32);

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  doc.text(`Generated: ${now}`, w - 14, 32, { align: 'right' });

  doc.setTextColor(TEXT_DARK);
}

function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y > pageH - 30) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(DARK);
  doc.text(title, 14, y);
  doc.setTextColor(TEXT_DARK);
  return y + 4;
}

function tableTheme(): Record<string, unknown> {
  return {
    headStyles: { fillColor: DARK_HEADER, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { textColor: TEXT_DARK, fontSize: 8.5 },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    styles: { cellPadding: 2.5 },
    margin: { left: 14, right: 14 },
  };
}

function startYAfter(doc: jsPDF, offset = 0): number {
  const last = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable;
  return (last?.finalY ?? 40) + offset;
}

export function generateAnalyticsPdf(data: ExportDataBundle): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { sessions, revenue, features, peakHours, dropoff, printStats } = data;

  addReportHeader(doc, data);

  // --- Summary metrics ---
  let y = 44;
  y = addSectionTitle(doc, 'Summary', y);
  const s = sessions?.summary;
  const r = revenue?.summary;

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Total Sessions', String(s?.total_sessions ?? '-')],
      ['Completed', String(s?.completed_sessions ?? '-')],
      ['Abandoned', String(s?.abandoned_sessions ?? '-')],
      ['Completion Rate', s ? formatPercent(s.completion_rate) : '-'],
      ['Avg Duration', s ? formatDuration(s.avg_duration_seconds) : '-'],
      ['Total Revenue', r ? formatIDR(r.total_revenue) : '-'],
      ['Avg Transaction', r ? formatIDR(r.avg_transaction_amount) : '-'],
      ['Payment Revenue', r ? formatIDR(r.payment_revenue) : '-'],
      ['Access Code Revenue', r ? formatIDR(r.access_code_revenue) : '-'],
    ],
    ...tableTheme(),
    columnStyles: { 0: { cellWidth: 60 }, 1: { halign: 'right' } },
  });

  // --- Feature breakdown ---
  if (features?.features?.length) {
    y = startYAfter(doc, 8);
    y = addSectionTitle(doc, 'Feature Breakdown', y);
    autoTable(doc, {
      startY: y,
      head: [['Feature', 'Sessions', 'Completed', 'Completion Rate', 'Avg Duration', 'Revenue']],
      body: features.features.map((f) => [
        f.feature === 'vibe_check' ? 'Vibe Check' : 'Photobooth',
        String(f.total_sessions),
        String(f.completed_sessions),
        formatPercent(f.completion_rate),
        formatDuration(f.avg_duration_seconds),
        formatIDR(f.revenue),
      ]),
      ...tableTheme(),
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    });
  }

  // --- Session timeseries ---
  if (sessions?.timeseries?.length) {
    y = startYAfter(doc, 8);
    y = addSectionTitle(doc, 'Session History', y);
    autoTable(doc, {
      startY: y,
      head: [['Period', 'Sessions', 'Completed', 'Abandoned', 'Avg Duration']],
      body: sessions.timeseries.map((t) => [
        formatPeriod(t.period),
        String(t.sessions),
        String(t.completed),
        String(t.abandoned),
        formatDuration(t.avg_duration_seconds),
      ]),
      ...tableTheme(),
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    });
  }

  // --- Revenue timeseries ---
  if (revenue?.timeseries?.length) {
    y = startYAfter(doc, 8);
    y = addSectionTitle(doc, 'Revenue History', y);
    autoTable(doc, {
      startY: y,
      head: [['Period', 'Revenue', 'Transactions', 'Payment', 'Access Code']],
      body: revenue.timeseries.map((t) => [
        formatPeriod(t.period),
        formatIDR(t.revenue),
        String(t.transactions),
        formatIDR(t.payment_revenue),
        formatIDR(t.access_code_revenue),
      ]),
      ...tableTheme(),
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    });
  }

  // --- Peak hours (top 10) ---
  if (peakHours?.slots?.length) {
    doc.addPage();
    y = 20;
    y = addSectionTitle(doc, 'Top 10 Busiest Hours', y);
    const top10 = [...peakHours.slots]
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 10);
    autoTable(doc, {
      startY: y,
      head: [['Day', 'Hour', 'Sessions', 'Vibe Check', 'Photobooth', 'Revenue']],
      body: top10.map((sl) => [
        DAY_NAMES[sl.day_of_week] ?? String(sl.day_of_week),
        `${sl.hour}:00`,
        String(sl.sessions),
        String(sl.vibe_check_sessions),
        String(sl.photobooth_sessions),
        formatIDR(sl.revenue),
      ]),
      ...tableTheme(),
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    });
  }

  // --- Dropoff funnel ---
  if (dropoff?.stages?.length) {
    y = startYAfter(doc, 8);
    y = addSectionTitle(doc, 'Drop-off Funnel', y);
    autoTable(doc, {
      startY: y,
      head: [['State', 'Count', 'Percentage']],
      body: dropoff.stages.map((st) => [
        st.state,
        String(st.count),
        formatPercent(st.percentage),
      ]),
      ...tableTheme(),
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    });
  }

  // --- Print reliability ---
  if (printStats) {
    y = startYAfter(doc, 8);
    y = addSectionTitle(doc, 'Print Reliability', y);
    autoTable(doc, {
      startY: y,
      head: [['Metric', 'Value']],
      body: [
        ['Total Prints', String(printStats.total_prints)],
        ['Successful', String(printStats.successful)],
        ['Failed', String(printStats.failed)],
        ['Success Rate', formatPercent(printStats.success_rate)],
      ],
      ...tableTheme(),
      columnStyles: { 0: { cellWidth: 60 }, 1: { halign: 'right' } },
    });
  }

  // Page numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} of ${totalPages}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' },
    );
  }

  return doc;
}
