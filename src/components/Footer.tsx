import React from 'react';
import { Database, MessageSquarePlus } from 'lucide-react';

interface FooterProps {
  onOpenApi: () => void;
  onOpenFeedback?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenApi, onOpenFeedback }) => {
  return (
    <footer className="mt-auto border-t border-zinc-800/80 bg-zinc-950 py-8 sm:py-10 text-xs text-zinc-500">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6">
          <div className="flex flex-col items-center md:items-start gap-1 text-center md:text-left">
            <span className="font-serif text-sm font-semibold text-zinc-300">
              MangaReader
            </span>
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
