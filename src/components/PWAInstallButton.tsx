import React, { useState } from 'react';
import { Download, Share2, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already installed or running as standalone PWA, suppress the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/90 hover:bg-rose-500 text-white rounded-lg text-xs font-medium transition-all shadow-sm hover:shadow-rose-950/40 cursor-pointer"
        title="Instalar MangaReader no dispositivo"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Instalar App</span>
        <span className="sm:hidden">Instalar</span>
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported on WebKit, guided modal provided)
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-lg text-xs font-medium border border-zinc-700/80 transition-colors cursor-pointer"
          title="Instalar no iPhone / iPad"
        >
          <Download className="h-3.5 w-3.5 text-rose-400" />
          <span>Instalar no iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl text-zinc-100">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <h3 className="text-base font-semibold text-white">Instalar no iPhone / iPad</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 space-y-3.5 text-xs text-zinc-300">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-zinc-800 shrink-0 text-rose-400">
                    <Share2 className="h-4 w-4" />
                  </div>
                  <div>
                    <strong className="text-zinc-100">1. Toque em Compartilhar</strong>
                    <p className="text-zinc-400 mt-0.5">Na barra inferior do Safari, clique no ícone de compartilhamento.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-zinc-800 shrink-0 text-emerald-400">
                    <PlusSquare className="h-4 w-4" />
                  </div>
                  <div>
                    <strong className="text-zinc-100">2. Adicionar à Tela de Início</strong>
                    <p className="text-zinc-400 mt-0.5">Role o menu para baixo e toque em "Adicionar à Tela de Início".</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full rounded-lg bg-rose-600 hover:bg-rose-500 py-2.5 text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  const [showDesktopGuide, setShowDesktopGuide] = useState(false);

  // Fallback for browsers that haven't fired beforeinstallprompt yet
  return (
    <>
      <button
        onClick={() => setShowDesktopGuide(true)}
        className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 hover:text-white rounded-lg text-xs font-medium border border-zinc-700/60 transition-colors cursor-pointer"
        title="Instalar aplicativo"
      >
        <Download className="h-3.5 w-3.5 text-zinc-400" />
        <span>Instalar App</span>
      </button>

      {showDesktopGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl text-zinc-100">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="text-base font-semibold text-white">Instalar MangaReader</h3>
              <button
                onClick={() => setShowDesktopGuide(false)}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-4 text-xs text-zinc-300 leading-relaxed">
              Para instalar no seu navegador: clique no ícone de instalação <strong className="text-rose-400">(computador com seta para baixo)</strong> na barra de endereços ou abra o menu do navegador e selecione <strong>"Instalar MangaReader"</strong>.
            </p>
            <button
              onClick={() => setShowDesktopGuide(false)}
              className="mt-6 w-full rounded-lg bg-zinc-800 hover:bg-zinc-700 py-2.5 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  );
};
