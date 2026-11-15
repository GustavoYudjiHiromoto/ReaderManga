import React from 'react';
import { Sparkles } from 'lucide-react';

interface RecommendationLoadingStateProps {
  title: string;
  subtitle: string;
  accent?: 'amber' | 'rose';
  cardCount?: number;
  compact?: boolean;
}

export const RecommendationLoadingState: React.FC<RecommendationLoadingStateProps> = ({
  title,
  subtitle,
  accent = 'amber',
  cardCount = 6,
  compact = false
}) => {
  const barColor =
    accent === 'rose'
      ? 'from-rose-500 via-amber-400 to-rose-500'
      : 'from-amber-400 via-rose-500 to-amber-400';
  const iconColor = accent === 'rose' ? 'text-rose-400' : 'text-amber-400';

  if (compact) {
    return (
      <div className="mb-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className={`h-3.5 w-3.5 shrink-0 animate-pulse ${iconColor}`} />
            <span className="text-xs font-medium text-zinc-200 truncate">{title}</span>
          </div>
          <span className="text-[11px] text-zinc-500 hidden sm:inline shrink-0">{subtitle}</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-zinc-800/90 overflow-hidden">
          <div className={`h-full rounded-full bg-gradient-to-r ${barColor} mr-loading-bar`} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Progress bar banner */}
      <div className="rounded-xl bg-zinc-900/50 border border-zinc-800/80 p-3.5 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className={`h-4 w-4 shrink-0 animate-pulse ${iconColor}`} />
            <span className="text-xs sm:text-sm font-semibold text-zinc-100">{title}</span>
          </div>
          <span className="text-[11px] text-zinc-400">{subtitle}</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div className={`h-full rounded-full bg-gradient-to-r ${barColor} mr-loading-bar`} />
        </div>
      </div>

      {/* Skeleton cover grid matching final card layout */}
      <div className="manga-cover-grid" aria-hidden="true">
        {Array.from({ length: cardCount }).map((_, idx) => (
          <div
            key={idx}
            className="flex flex-col min-w-0 bg-zinc-900/40 border border-zinc-800/60 rounded-xl overflow-hidden animate-pulse"
          >
            <div className="aspect-[3/4] w-full bg-zinc-800/70 relative">
              <div className="absolute top-2 left-2 h-4 w-14 rounded-md bg-zinc-700/80" />
            </div>
            <div className="p-2.5 sm:p-3 space-y-2">
              <div className="h-3.5 w-20 rounded bg-zinc-800" />
              <div className="h-3.5 w-4/5 rounded bg-zinc-800" />
              <div className="h-3 w-1/2 rounded bg-zinc-800/70" />
              <div className="pt-2 border-t border-zinc-800/50 space-y-1.5">
                <div className="h-2.5 w-full rounded bg-zinc-800/80" />
                <div className="h-2.5 w-2/3 rounded bg-zinc-800/60" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
