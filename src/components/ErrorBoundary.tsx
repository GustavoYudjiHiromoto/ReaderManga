import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readableMessage = error?.message || 'Erro inesperado na aplicação.';
    try {
      const parsed = JSON.parse(readableMessage);
      if (parsed && typeof parsed.error === 'string') {
        readableMessage = parsed.error;
      }
    } catch {
      // plain error string
    }
    return { hasError: true, message: readableMessage };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 font-sans">
          <div className="max-w-md w-full rounded-2xl bg-zinc-900/90 border border-zinc-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Algo deu errado</h2>
                <p className="text-xs text-zinc-400">Ocorreu um erro inesperado ao carregar esta tela.</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-850 text-xs text-zinc-300 font-mono break-words">
              {this.state.message}
            </div>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Recarregar aplicação</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
