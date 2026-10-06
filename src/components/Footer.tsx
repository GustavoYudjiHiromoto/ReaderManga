import React from 'react';
import { Layers, ShieldCheck, Database } from 'lucide-react';

interface FooterProps {
  onOpenApi: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenApi }) => {
  return (
    <footer className="mt-auto border-t border-zinc-800/80 bg-zinc-950 py-10 text-xs text-zinc-500">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-1">
            <span className="font-serif text-sm font-semibold text-zinc-300">
              MangaReader
            </span>
            <p className="text-zinc-500">
              Plataforma desacoplada para descoberta, leitura e distribuição de mangás.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-zinc-400">
            <button
              onClick={onOpenApi}
              className="hover:text-rose-400 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Database className="h-3.5 w-3.5" />
              Especificação REST & Feed de Recomendação
            </button>
            <span className="text-zinc-700">·</span>
            <span>Múltiplas Fontes (MangaDex & OpenManga)</span>
            <span className="text-zinc-700">·</span>
            <span className="font-mono tabular-nums">v1.0.0</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
