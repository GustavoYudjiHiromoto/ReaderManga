import React from 'react';
import { X, Keyboard, ArrowLeft, ArrowRight, Maximize2, Play, MousePointer, HelpCircle } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  readingDirection: 'rtl' | 'ltr';
  readerMode: 'webtoon' | 'single' | 'double';
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
  readingDirection,
  readerMode
}) => {
  if (!isOpen) return null;

  const shortcuts = [
    {
      group: 'Navegação de Páginas',
      items: [
        {
          keys: readingDirection === 'rtl' ? ['←', 'PageDown'] : ['→', 'PageDown'],
          desc: 'Avançar para a próxima página (ou próximo capítulo ao chegar no fim)'
        },
        {
          keys: readingDirection === 'rtl' ? ['→', 'PageUp'] : ['←', 'PageUp'],
          desc: 'Voltar para a página anterior'
        },
        {
          keys: ['Espaço'],
          desc: 'Avançar meia página (Webtoon) ou próxima página (Página Única)'
        },
        {
          keys: ['↓', '↑'],
          desc: 'Rolar verticalmente com suavidade (Modo Webtoon)'
        }
      ]
    },
    {
      group: 'Visualização & Controles',
      items: [
        {
          keys: ['F'],
          desc: 'Alternar modo Tela Cheia (Fullscreen)'
        },
        {
          keys: ['M'],
          desc: 'Ocultar ou exibir barras e menus de leitura (HUD)'
        },
        {
          keys: ['Clique no Centro'],
          desc: 'Alternar exibição da barra superior e controles'
        },
        {
          keys: ['B'],
          desc: 'Adicionar ou remover marcador na página atual'
        },
        {
          keys: ['Esc'],
          desc: 'Fechar painel de configurações ou este modal'
        }
      ]
    },
    {
      group: 'Rolagem Automática (Modo Webtoon)',
      items: [
        {
          keys: ['A'],
          desc: 'Iniciar ou pausar a rolagem automática com velocidade contínua'
        },
        {
          keys: ['Roda do Mouse'],
          desc: 'Rolar manualmente pausa instantaneamente a rolagem automática'
        }
      ]
    }
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <Keyboard className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100">
                Atalhos de Teclado & Controles
              </h2>
              <p className="text-xs text-zinc-400">
                Modo ativo: <span className="text-rose-400 font-medium capitalize">{readerMode}</span> · Direção: <span className="text-rose-400 font-medium uppercase">{readingDirection}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Shortcuts Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {shortcuts.map((section) => (
            <div key={section.group}>
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2.5">
                {section.group}
              </h3>
              <div className="space-y-2">
                {section.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-4 p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-xs"
                  >
                    <span className="text-zinc-300 flex-1">{item.desc}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.keys.map((k, kIdx) => (
                        <kbd
                          key={kIdx}
                          className="px-2 py-1 bg-zinc-800 border border-zinc-700/80 rounded-md text-[11px] font-mono font-semibold text-zinc-200 shadow-sm"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-950/40 text-[11px] text-zinc-500 flex items-center justify-between">
          <span>Pressione <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded font-mono text-zinc-300">?</kbd> a qualquer momento no leitor para reabrir.</span>
          <button
            onClick={onClose}
            className="px-3.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
