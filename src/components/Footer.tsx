import React from 'react';
import { Database, MessageSquarePlus, RefreshCw } from 'lucide-react';
import { useAppVersion } from '../hooks/useAppVersion.js';
import { formatShortBuildLabel } from '../services/appVersion.js';

interface FooterProps {
  onOpenApi: () => void;
  onOpenFeedback?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenApi, onOpenFeedback }) => {
  const { client, status, isApplying, checkNow, applyUpdate } = useAppVersion();
  const buildLabel = formatShortBuildLabel(client);

  return (
    <footer className="mt-auto border-t border-zinc-800/80 bg-zinc-950 py-8 sm:py-10 text-xs text-zinc-500">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6">
          <div className="flex flex-col items-center md:items-start gap-1 text-center md:text-left">
            <div className="flex items-center gap-2">
              <span className="font-serif text-sm font-semibold text-zinc-300">
                MangaReader
              </span>
              <button
                type="button"
                onClick={() => (status === 'update_available' ? applyUpdate() : checkNow())}
                disabled={isApplying || status === 'checking'}
                title={
                  status === 'update_available'
                    ? 'Nova versão disponível no servidor — clique para atualizar'
                    : status === 'latest'
                    ? `Versão atualizada (${client.buildId}) — clique para verificar novamente`
                    : `Build ${client.buildId} — clique para verificar atualizações`
                }
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-mono transition-colors cursor-pointer ${
                  status === 'update_available'
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25'
                    : 'bg-zinc-900/90 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    status === 'update_available'
                      ? 'bg-rose-400 animate-pulse'
                      : status === 'latest'
                      ? 'bg-emerald-400'
                      : 'bg-zinc-500'
                  }`}
                />
                <span>{buildLabel}</span>
                {status === 'update_available' ? (
                  <span className="font-sans font-semibold text-rose-300">· Atualizar</span>
                ) : status === 'checking' || isApplying ? (
                  <RefreshCw className="h-2.5 w-2.5 animate-spin text-zinc-400" />
                ) : null}
              </button>
            </div>
            <p className="text-zinc-500 text-balance">
              Plataforma desacoplada para descoberta, leitura e distribuição de mangás.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-zinc-400 text-center">
            {onOpenFeedback && (
              <>
                <button
                  onClick={onOpenFeedback}
                  className="hover:text-rose-400 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5 shrink-0" />
                  <span>Enviar Feedback</span>
                </button>
                <span className="text-zinc-700 hidden sm:inline" aria-hidden="true">·</span>
              </>
            )}
            <button
              onClick={onOpenApi}
              className="hover:text-rose-400 transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <Database className="h-3.5 w-3.5 shrink-0" />
              <span>Especificação REST &amp; Feed</span>
            </button>
            <span className="text-zinc-700 hidden sm:inline" aria-hidden="true">·</span>
            <span>Fontes ao vivo integradas</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
