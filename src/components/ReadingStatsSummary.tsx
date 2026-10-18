import React, { useState, useEffect } from 'react';
import { BookOpen, Clock, Layers, Sparkles, TrendingUp, Bookmark, Calendar } from 'lucide-react';
import { HistoryService } from '../services/history';
import { ReadingStats } from '../types/manga';

interface ReadingStatsSummaryProps {
  favoritesCount: number;
}

export const ReadingStatsSummary: React.FC<ReadingStatsSummaryProps> = ({ favoritesCount }) => {
  const [stats, setStats] = useState<ReadingStats>(() => HistoryService.getReadingStats());

  useEffect(() => {
    // Initial fetch
    setStats(HistoryService.getReadingStats());

    // Subscribe to live updates from history, timer and tab storage events
    const unsubscribe = HistoryService.subscribe(() => {
      setStats(HistoryService.getReadingStats());
    });

    return unsubscribe;
  }, []);

  const hasActivity = stats.totalChaptersRead > 0 || stats.totalSecondsSpent > 0;

  return (
    <div className="mb-8 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 p-5 sm:p-6 backdrop-blur-sm shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-5 border-b border-zinc-800/60">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-br from-rose-500/20 to-amber-500/20 border border-rose-500/30 text-rose-400">
            <TrendingUp className="h-4 w-4 text-rose-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>Estatísticas de Leitura</span>
              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/20">
                Ao Vivo
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              Métricas calculadas em tempo real com base no seu histórico e sessões de leitura
            </p>
          </div>
        </div>

        {stats.lastReadDate && (
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 self-start sm:self-auto">
            <Calendar className="h-3.5 w-3.5" />
            <span>Última leitura: {new Date(stats.lastReadDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}
      </div>

      {/* Grid of Key Stat Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-4">
        
        {/* 1. Total Chapters Read */}
        <div className="flex flex-col justify-between p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 hover:border-rose-500/30 transition-colors group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-400">Capítulos Lidos</span>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 group-hover:scale-110 transition-transform">
              <BookOpen className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-mono tabular-nums">
              {stats.totalChaptersRead}
            </span>
            <span className="text-xs text-zinc-500 font-medium">
              {stats.totalChaptersRead === 1 ? 'capítulo' : 'capítulos'}
            </span>
          </div>
          <span className="text-[11px] text-zinc-500 mt-1">
            {stats.uniqueMangasRead > 0
              ? `Em ${stats.uniqueMangasRead} ${stats.uniqueMangasRead === 1 ? 'obra' : 'obras'} diferentes`
              : 'Nenhum capítulo lido ainda'}
          </span>
        </div>

        {/* 2. Total Time Spent Reading */}
        <div className="flex flex-col justify-between p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 hover:border-amber-500/30 transition-colors group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-400">Tempo de Leitura</span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 group-hover:scale-110 transition-transform">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-mono tabular-nums">
              {stats.formattedTimeSpent}
            </span>
          </div>
          <span className="text-[11px] text-zinc-500 mt-1">
            {stats.totalMinutesSpent > 0
              ? `~${stats.totalMinutesSpent} minutos dedicados`
              : 'Inicie a leitura para registrar tempo'}
          </span>
        </div>

        {/* 3. Total Pages Read */}
        <div className="flex flex-col justify-between p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 hover:border-emerald-500/30 transition-colors group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-400">Páginas Lidas</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-mono tabular-nums">
              {stats.totalPagesRead}
            </span>
            <span className="text-xs text-zinc-500 font-medium">páginas</span>
          </div>
          <span className="text-[11px] text-zinc-500 mt-1">
            Média de páginas percorridas
          </span>
        </div>

        {/* 4. Library Favorites Size */}
        <div className="flex flex-col justify-between p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 hover:border-sky-500/30 transition-colors group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-400">Favoritos Salvos</span>
            <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 group-hover:scale-110 transition-transform">
              <Bookmark className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-mono tabular-nums">
              {favoritesCount}
            </span>
            <span className="text-xs text-zinc-500 font-medium">
              {favoritesCount === 1 ? 'mangá' : 'mangás'}
            </span>
          </div>
          <span className="text-[11px] text-zinc-500 mt-1">
            Coleção salva nesta biblioteca
          </span>
        </div>

      </div>

      {!hasActivity && (
        <div className="mt-4 pt-3 border-t border-zinc-800/40 text-center sm:text-left">
          <p className="text-xs text-zinc-500">
            Dica: Ao ler capítulos no leitor integrado, suas páginas e tempo ativo serão computados automaticamente aqui.
          </p>
        </div>
      )}
    </div>
  );
};
