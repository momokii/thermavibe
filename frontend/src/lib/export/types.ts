import type {
  SessionAnalyticsResponse,
  RevenueAnalyticsResponse,
  FeatureBreakdownResponse,
  PeakHoursResponse,
  DropoffFunnelResponse,
  PrintStatsResponse,
} from '@/api/types';

export interface ExportDataBundle {
  rangeLabel: string;
  startDate: string;
  endDate: string;
  sessions: SessionAnalyticsResponse | undefined;
  revenue: RevenueAnalyticsResponse | undefined;
  features: FeatureBreakdownResponse | undefined;
  peakHours: PeakHoursResponse | undefined;
  dropoff: DropoffFunnelResponse | undefined;
  printStats: PrintStatsResponse | undefined;
}
