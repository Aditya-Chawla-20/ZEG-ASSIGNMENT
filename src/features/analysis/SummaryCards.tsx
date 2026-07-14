import { LandPlot, Ban, CheckCircle2, Percent } from 'lucide-react';
import type { AnalysisSummary } from '@/types';

interface SummaryCardsProps {
  summary: AnalysisSummary | null;
  isLoading: boolean;
}

interface CardConfig {
  key: string;
  label: string;
  value: string;
  icon: typeof LandPlot;
  accent: string;
  iconBg: string;
}

function formatAcres(acres: number | null | undefined): string {
  if (acres == null || Number.isNaN(acres)) return '—';
  return `${acres.toFixed(2)} ac`;
}

function formatPct(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(pct)) return '—';
  return `${pct.toFixed(1)}%`;
}

export function SummaryCards({ summary, isLoading }: SummaryCardsProps) {
  if (isLoading || !summary) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[88px] animate-pulse-subtle rounded-lg border border-brand-100 bg-brand-50"
          />
        ))}
      </div>
    );
  }

  const isLowBuild = summary.buildablePercentage < 50;

  const cards: CardConfig[] = [
    {
      key: 'parcel',
      label: 'Parcel',
      value: formatAcres(summary.parcelAcres),
      icon: LandPlot,
      accent: 'text-brand-700',
      iconBg: 'bg-brand-100',
    },
    {
      key: 'excluded',
      label: 'Excluded',
      value: formatAcres(summary.excludedAcres),
      icon: Ban,
      accent: 'text-excluded-700',
      iconBg: 'bg-excluded-100',
    },
    {
      key: 'buildable',
      label: 'Buildable',
      value: formatAcres(summary.buildableAcres),
      icon: CheckCircle2,
      accent: 'text-buildable-700',
      iconBg: 'bg-buildable-100',
    },
    {
      key: 'pct',
      label: 'Buildable %',
      value: formatPct(summary.buildablePercentage),
      icon: Percent,
      accent: isLowBuild ? 'text-floodplain-700' : 'text-buildable-700',
      iconBg: isLowBuild ? 'bg-floodplain-100' : 'bg-buildable-100',
    },
  ];

  const isFullyExcluded = summary.buildableAcres < 0.01;

  const barColor =
    summary.buildablePercentage >= 70
      ? 'bg-buildable-500'
      : summary.buildablePercentage >= 40
        ? 'bg-floodplain-500'
        : 'bg-excluded-500';

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.key}
              className="flex flex-col justify-between rounded-lg border border-brand-200 bg-white p-3 shadow-sm"
              data-testid={`summary-card-${c.key}`}
            >
              <div className="flex items-center gap-2">
                <span className={`flex h-7 w-7 items-center justify-center rounded-md ${c.iconBg}`}>
                  <Icon className={`h-4 w-4 ${c.accent}`} />
                </span>
                <span className="text-xs font-medium uppercase tracking-wide text-brand-500">
                  {c.label}
                </span>
              </div>
              <div className={`mt-2 text-xl font-semibold ${c.accent}`}>{c.value}</div>
            </div>
          );
        })}
      </div>

      {/* Buildable area progress bar */}
      <div className="rounded-lg border border-brand-200 bg-white p-3 shadow-sm">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="font-medium uppercase tracking-wide text-brand-500">
            Buildable Area
          </span>
          <span className="tabular-nums font-semibold text-brand-700">
            {summary.buildablePercentage.toFixed(1)}%
          </span>
        </div>
        <div
          className="h-2.5 w-full overflow-hidden rounded-full bg-brand-100"
          role="progressbar"
          aria-valuenow={Math.round(summary.buildablePercentage)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Buildable area percentage"
        >
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${Math.min(100, Math.max(0, summary.buildablePercentage))}%` }}
          />
        </div>
        {isFullyExcluded && (
          <p className="mt-1.5 text-xs font-medium text-excluded-700">
            Fully excluded — no buildable land
          </p>
        )}
      </div>
    </div>
  );
}
