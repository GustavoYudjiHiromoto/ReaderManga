import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Link2,
  Unlink,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import {
  TrackerService,
  MangaTrackerStatusInfo
} from '../services/trackerService.js';

interface TrackerStatusBadgeProps {
  mangaId: string;
  mangaTitle: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  onOpenTrackers?: (mangaId?: string, mangaTitle?: string) => void;
  className?: string;
}

export const TrackerStatusBadge: React.FC<TrackerStatusBadgeProps> = ({
  mangaId,
  mangaTitle,
  size = 'md',
  showLabel = false,
  onOpenTrackers,
  className = ''
}) => {
  const [statusInfo, setStatusInfo] = useState<MangaTrackerStatusInfo>(() =>
    TrackerService.getMangaSyncStatus(mangaId)
  );
  const [isRetrying, setIsRetrying] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    setStatusInfo(TrackerService.getMangaSyncStatus(mangaId));
    const unsub = TrackerService.subscribe(() => {
      setStatusInfo(TrackerService.getMangaSyncStatus(mangaId));
    });
    return () => unsub();
  }, [mangaId]);

  const handleBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onOpenTrackers) {
      onOpenTrackers(mangaId, mangaTitle);
    }
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      setIsRetrying(true);
      const res = await TrackerService.retrySync(mangaId, mangaTitle);
      setStatusInfo(res);
    } finally {
      setIsRetrying(false);
    }
  };

  const { overallStatus, anilist, mal, hasTrackersConnected, lastScrobbledChapter } = statusInfo;

  // Icon sizing
  const iconSizeClass =
    size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5';

  const badgePaddingClass =
    size === 'sm'
      ? 'p-1'
      : size === 'lg'
      ? 'px-2.5 py-1 text-xs gap-1.5'
      : 'px-2 py-0.5 text-[11px] gap-1';

  // State visuals
  let containerStyle = '';
  let iconElement: React.ReactNode = null;
  let statusText = '';

  if (overallStatus === 'synced') {
    containerStyle =
      'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    iconElement = <CheckCircle2 className={`${iconSizeClass} text-emerald-400 shrink-0`} />;
    statusText = 'Sincronizado';
  } else if (overallStatus === 'error') {
    containerStyle =
      'bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/40 animate-pulse';
    iconElement = isRetrying ? (
      <RefreshCw className={`${iconSizeClass} text-rose-400 animate-spin shrink-0`} />
    ) : (
      <AlertCircle className={`${iconSizeClass} text-rose-400 shrink-0`} />
    );
    statusText = 'Erro de Sync';
  } else if (overallStatus === 'unlinked') {
    containerStyle =
      'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30';
    iconElement = <Unlink className={`${iconSizeClass} text-amber-400 shrink-0`} />;
    statusText = 'Não vinculado';
  } else {
    // Disconnected (no accounts connected)
    containerStyle =
      'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800';
    iconElement = <Link2 className={`${iconSizeClass} text-zinc-500 shrink-0`} />;
    statusText = 'Sem rastreamento';
  }

  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        type="button"
        onClick={handleBadgeClick}
        title={statusInfo.tooltip}
        className={`inline-flex items-center justify-center font-medium rounded-md transition-all cursor-pointer backdrop-blur-sm shadow-sm select-none ${badgePaddingClass} ${containerStyle}`}
        aria-label={`Status de rastreamento: ${statusInfo.label}`}
      >
        {iconElement}
        {showLabel && <span className="font-semibold truncate">{statusText}</span>}
      </button>

      {/* Floating Detailed Tooltip / Popover on hover */}
      {showTooltip && (
        <div
          role="tooltip"
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-zinc-900/95 backdrop-blur-md border border-zinc-700/80 rounded-xl shadow-2xl text-left text-xs pointer-events-none animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-zinc-700" />

          {/* Header */}
          <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800 mb-2">
            <div className="flex items-center gap-1.5 font-bold text-zinc-200">
              {iconElement}
              <span>Rastreamento Externo</span>
            </div>
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider ${
                overallStatus === 'synced'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : overallStatus === 'error'
                  ? 'bg-rose-500/20 text-rose-300'
                  : overallStatus === 'unlinked'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {statusInfo.label}
            </span>
          </div>

          {/* Details per service */}
          <div className="space-y-1.5 text-[11px]">
            {/* AniList status */}
            <div className="flex items-start justify-between gap-2">
              <span className="text-zinc-400 font-medium">AniList:</span>
              <span className="text-right">
                {!anilist.connected ? (
                  <span className="text-zinc-500">Desconectado</span>
                ) : anilist.status === 'error' ? (
                  <span className="text-rose-400 font-medium flex items-center gap-1">
                    <AlertCircle className="h-2.5 w-2.5" />
                    {anilist.error || 'Erro'}
                  </span>
                ) : anilist.linked ? (
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Vinculado (#{anilist.id})
                  </span>
                ) : (
                  <span className="text-amber-400">Não vinculado</span>
                )}
              </span>
            </div>

            {/* MyAnimeList status */}
            <div className="flex items-start justify-between gap-2">
              <span className="text-zinc-400 font-medium">MyAnimeList:</span>
              <span className="text-right">
                {!mal.connected ? (
                  <span className="text-zinc-500">Desconectado</span>
                ) : mal.status === 'error' ? (
                  <span className="text-rose-400 font-medium flex items-center gap-1">
                    <AlertCircle className="h-2.5 w-2.5" />
                    {mal.error || 'Erro'}
                  </span>
                ) : mal.linked ? (
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Vinculado (#{mal.id})
                  </span>
                ) : (
                  <span className="text-amber-400">Não vinculado</span>
                )}
              </span>
            </div>

            {lastScrobbledChapter && (
              <div className="pt-1.5 border-t border-zinc-800/80 flex items-center justify-between text-zinc-400 font-mono text-[10px]">
                <span>Último cap. sincronizado:</span>
                <span className="text-zinc-200 font-bold">Cap. {lastScrobbledChapter}</span>
              </div>
            )}
          </div>

          {/* Action prompt */}
          <div className="mt-2.5 pt-2 border-t border-zinc-800 text-[10px] text-sky-400 flex items-center justify-between">
            <span>Clique para gerenciar vínculo</span>
            <ExternalLink className="h-2.5 w-2.5" />
          </div>
        </div>
      )}
    </div>
  );
};
