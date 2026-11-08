import React from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FolderDown,
  Layers,
  BookOpen,
  Check,
  BookmarkCheck,
  Folder
} from 'lucide-react';

export interface BackupProgressState {
  isOpen: boolean;
  stage: 'reading' | 'decompressing' | 'decoding' | 'merging' | 'completed' | 'error';
  stageLabel: string;
  percent: number; // 0 - 100
  currentItem?: string;
  currentCount?: number;
  totalCount?: number;
  fileName?: string;
  isTachibk?: boolean;
  resultSummary?: {
    favoritesAdded: number;
    historyAdded: number;
    totalFavorites: number;
    totalHistory: number;
    categoriesAdded?: number;
  } | null;
  error?: string | null;
}

interface BackupProgressModalProps {
  progress: BackupProgressState;
  onClose: () => void;
}

export const BackupProgressModal: React.FC<BackupProgressModalProps> = ({
  progress,
  onClose
}) => {
  if (!progress.isOpen) return null;

  const {
    stage,
    stageLabel,
    percent,
    currentItem,
    currentCount,
    totalCount,
    fileName,
    isTachibk,
    resultSummary,
    error
  } = progress;

  const isCompleted = stage === 'completed';
  const isError = stage === 'error';
  const isProcessing = !isCompleted && !isError;

  // Determination of step statuses
  const getStepStatus = (stepIndex: number): 'done' | 'active' | 'pending' => {
    if (isCompleted) return 'done';
    if (isError) return 'pending';

    if (stepIndex === 1) {
      if (percent >= 15) return 'done';
      return 'active';
    }
    if (stepIndex === 2) {
      if (percent >= 30) return 'done';
      if (percent >= 15) return 'active';
      return 'pending';
    }
    if (stepIndex === 3) {
      if (percent >= 75) return 'done';
      if (percent >= 30) return 'active';
      return 'pending';
    }
    if (stepIndex === 4) {
      if (percent >= 100) return 'done';
      if (percent >= 75) return 'active';
      return 'pending';
    }
    return 'pending';
  };

  const steps = [
    { id: 1, label: 'Leitura', desc: 'Carregando arquivo' },
    { id: 2, label: isTachibk ? 'GZIP' : 'Validação', desc: isTachibk ? 'Descomprimindo' : 'Checando integridade' },
    { id: 3, label: isTachibk ? 'Protobuf' : 'Parser', desc: isTachibk ? 'Decodificando binário' : 'Processando JSON' },
    { id: 4, label: 'Biblioteca', desc: 'Mesclando dados' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl p-6 sm:p-7 relative overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Decorative background glow */}
        <div
          className={`absolute -top-24 -right-24 w-60 h-60 rounded-full blur-3xl pointer-events-none transition-colors duration-700 ${
            isCompleted
              ? 'bg-emerald-500/15'
              : isError
              ? 'bg-rose-500/20'
              : 'bg-rose-500/10'
          }`}
        />

        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border shrink-0 transition-colors ${
                isCompleted
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : isError
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}
            >
              {isCompleted ? (
                <CheckCircle2 className="h-6 w-6" />
              ) : isError ? (
                <AlertCircle className="h-6 w-6" />
              ) : (
                <FolderDown className="h-6 w-6 animate-pulse" />
              )}
            </div>
            <div>
              <h3 className="font-serif text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                {isCompleted
                  ? 'Backup Restaurado com Sucesso!'
                  : isError
                  ? 'Falha na Restauração'
                  : isTachibk
                  ? 'Restaurando Backup do Mihon'
                  : 'Restaurando Backup da Biblioteca'}
              </h3>
              <p className="text-xs text-zinc-400 truncate max-w-[280px] sm:max-w-sm mt-0.5">
                {fileName ? `Arquivo: ${fileName}` : 'Sincronizando favoritos e capítulos'}
              </p>
            </div>
          </div>

          {(isCompleted || isError) && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
              title="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Step Progress Checklist */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          {steps.map((st) => {
            const status = getStepStatus(st.id);
            return (
              <div
                key={st.id}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  status === 'done'
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                    : status === 'active'
                    ? 'bg-rose-950/30 border-rose-500/50 text-white shadow-sm shadow-rose-950/40'
                    : 'bg-zinc-900/40 border-zinc-850 text-zinc-500'
                }`}
              >
                <div className="flex items-center justify-center mb-1">
                  {status === 'done' ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : status === 'active' ? (
                    <RefreshCw className="h-3.5 w-3.5 text-rose-400 animate-spin" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-zinc-700" />
                  )}
                </div>
                <div className="text-[11px] font-semibold truncate">{st.label}</div>
                <div className="text-[9px] text-zinc-400 truncate hidden sm:block">{st.desc}</div>
              </div>
            );
          })}
        </div>

        {/* Main Progress Bar & Percentage (Visible during processing and completion) */}
        {!isError && (
          <div className="space-y-3 mb-6">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-zinc-200 flex items-center gap-1.5">
                {isProcessing && <RefreshCw className="h-3.5 w-3.5 animate-spin text-rose-400" />}
                <span>{stageLabel}</span>
              </span>
              <span className="font-mono text-xl sm:text-2xl font-bold tracking-tight text-white tabular-nums">
                {percent}%
              </span>
            </div>

            {/* Glowing Progress Track */}
            <div className="relative w-full h-3 rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-300 ease-out relative ${
                  isCompleted
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : 'bg-gradient-to-r from-rose-600 via-pink-500 to-emerald-400'
                }`}
                style={{ width: `${Math.max(4, Math.min(100, percent))}%` }}
              >
                {/* Visual Shimmer Bar */}
                {isProcessing && (
                  <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
                )}
              </div>
            </div>

            {/* Live Ticker: Current Item being processed */}
            {isProcessing && currentItem && (
              <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1 pt-0.5">
                <span className="truncate max-w-[280px]">
                  Processando: <strong className="text-zinc-200">"{currentItem}"</strong>
                </span>
                {currentCount !== undefined && (
                  <span className="font-mono text-zinc-400 shrink-0 ml-2">
                    {currentCount} {totalCount ? `/ ${totalCount}` : 'obras'}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Completed State Summary Cards */}
        {isCompleted && resultSummary && (
          <div className="space-y-4 mb-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Favorites Added */}
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
                <div className="flex items-center justify-center text-rose-400 mb-1">
                  <BookmarkCheck className="h-4 w-4" />
                </div>
                <div className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
                  +{resultSummary.favoritesAdded}
                </div>
                <div className="text-[10px] text-zinc-400">Novos Favoritos</div>
              </div>

              {/* History / Read Chapters */}
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
                <div className="flex items-center justify-center text-sky-400 mb-1">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div className="text-xl font-bold font-mono text-sky-300 tabular-nums">
                  +{resultSummary.historyAdded}
                </div>
                <div className="text-[10px] text-zinc-400">Capítulos Lidos</div>
              </div>

              {/* Categories */}
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
                <div className="flex items-center justify-center text-amber-400 mb-1">
                  <Folder className="h-4 w-4" />
                </div>
                <div className="text-xl font-bold font-mono text-amber-300 tabular-nums">
                  {resultSummary.categoriesAdded ?? 0}
                </div>
                <div className="text-[10px] text-zinc-400">Categorias</div>
              </div>

              {/* Total Library */}
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
                <div className="flex items-center justify-center text-emerald-400 mb-1">
                  <Layers className="h-4 w-4" />
                </div>
                <div className="text-xl font-bold font-mono text-white tabular-nums">
                  {resultSummary.totalFavorites}
                </div>
                <div className="text-[10px] text-zinc-400">Total na Coleção</div>
              </div>
            </div>

            <p className="text-xs text-zinc-400 text-center">
              Todos os metadados, capas, notas e categorias do backup foram mesclados à sua biblioteca sem substituir dados existentes.
            </p>
          </div>
        )}

        {/* Error State Card */}
        {isError && (
          <div className="mb-6 p-4 rounded-xl bg-rose-950/30 border border-rose-500/40 text-rose-200 text-xs space-y-2">
            <div className="flex items-center gap-2 font-semibold text-rose-300">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>Erro ao processar arquivo de backup:</span>
            </div>
            <p className="text-zinc-300">{error || 'O arquivo fornecido está corrompido ou em formato incompatível.'}</p>
            <p className="text-[11px] text-zinc-400">
              Certifique-se de que o arquivo é um backup válido do Mihon/Tachiyomi (extensão <strong>.tachibk</strong> ou <strong>.proto.gz</strong>) ou um backup em <strong>.json</strong> do MangaReader.
            </p>
          </div>
        )}

        {/* Action Footer */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-850">
          {isProcessing ? (
            <div className="text-xs text-zinc-500 italic">
              Por favor, aguarde o término do processamento...
            </div>
          ) : (
            <button
              onClick={onClose}
              className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-semibold shadow-lg transition-all cursor-pointer ${
                isCompleted
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
              }`}
            >
              {isCompleted ? 'Concluir & Visualizar Biblioteca' : 'Fechar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
