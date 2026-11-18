import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  MessageSquarePlus,
  Bug,
  Unplug,
  Compass,
  Lightbulb,
  Send,
  CheckCircle2,
  AlertCircle,
  Trash2,
  RefreshCw,
  Clock,
  MessageCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { ExtensionService } from '../services/extensionService.js';
import {
  FEEDBACK_LIMITS,
  FEEDBACK_STATUS_META,
  FEEDBACK_TYPE_META,
  FeedbackItem,
  FeedbackService,
  FeedbackType
} from '../services/feedbackService.js';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  contextUrl?: string;
  mangaContext?: string;
}

const TYPE_ICONS: Record<FeedbackType, React.ReactNode> = {
  bug: <Bug className="h-4 w-4 text-rose-400 shrink-0" />,
  source_broken: <Unplug className="h-4 w-4 text-amber-400 shrink-0" />,
  recommendation: <Compass className="h-4 w-4 text-sky-400 shrink-0" />,
  suggestion: <Lightbulb className="h-4 w-4 text-emerald-400 shrink-0" />,
  other: <MessageCircle className="h-4 w-4 text-zinc-300 shrink-0" />
};

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  contextUrl,
  mangaContext
}) => {
  const { user, loginWithGoogle } = useAuth();
  const [activeView, setActiveView] = useState<'form' | 'mine'>('form');
  const [type, setType] = useState<FeedbackType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [includeContext, setIncludeContext] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [submitSuccessId, setSubmitSuccessId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [myItems, setMyItems] = useState<FeedbackItem[]>([]);
  const [myItemsError, setMyItemsError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const detectedContextUrl = useMemo(() => {
    if (contextUrl) return contextUrl.slice(0, FEEDBACK_LIMITS.CONTEXT_URL_MAX);
    if (typeof window !== 'undefined') {
      return `${window.location.pathname}${window.location.search}`.slice(0, FEEDBACK_LIMITS.CONTEXT_URL_MAX);
    }
    return '/';
  }, [contextUrl, isOpen]);

  const detectedMangaContext = useMemo(() => {
    if (mangaContext && mangaContext.trim()) {
      return mangaContext.trim().slice(0, FEEDBACK_LIMITS.MANGA_CONTEXT_MAX);
    }
    const enabled = ExtensionService.getEnabledSourceIds();
    return `Fontes ativas: ${enabled.join(', ') || 'nenhuma'}`.slice(0, FEEDBACK_LIMITS.MANGA_CONTEXT_MAX);
  }, [mangaContext, isOpen]);

  useEffect(() => {
    if (!isOpen || !user?.uid) {
      setMyItems([]);
      return;
    }

    const unsubscribe = FeedbackService.subscribeMyFeedback(
      user.uid,
      (items) => {
        setMyItems(items);
        setMyItemsError(null);
      },
      (msg) => setMyItemsError(msg)
    );

    return () => unsubscribe();
  }, [isOpen, user?.uid]);

  useEffect(() => {
    if (!isOpen) {
      setErrorMessage(null);
      setSubmitSuccessId(null);
      setConfirmDeleteId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogin = async () => {
    try {
      setIsLoggingIn(true);
      setErrorMessage(null);
      await loginWithGoogle();
    } catch {
      setErrorMessage('Não foi possível concluir o login com o Google.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!user) {
      setErrorMessage('Entre com sua conta Google abaixo para enviar o feedback.');
      return;
    }

    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    if (cleanTitle.length < FEEDBACK_LIMITS.TITLE_MIN) {
      setErrorMessage(`Digite um título curto (mínimo ${FEEDBACK_LIMITS.TITLE_MIN} caracteres).`);
      return;
    }
    if (cleanDescription.length < FEEDBACK_LIMITS.DESC_MIN) {
      setErrorMessage(`Descreva melhor o que aconteceu (mínimo ${FEEDBACK_LIMITS.DESC_MIN} caracteres).`);
      return;
    }

    try {
      setIsSubmitting(true);
      const id = await FeedbackService.submitFeedback({
        type,
        title: cleanTitle,
        description: cleanDescription,
        contextUrl: includeContext ? detectedContextUrl : undefined,
        mangaContext: includeContext ? detectedMangaContext : undefined
      });
      setSubmitSuccessId(id);
      setTitle('');
      setDescription('');
    } catch (err: any) {
      let msg = err?.message || 'Erro ao enviar feedback.';
      try {
        const parsed = JSON.parse(msg);
        if (parsed?.error) msg = parsed.error;
      } catch {
        // plain string message
      }
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteOpenItem = async (id: string) => {
    try {
      await FeedbackService.deleteFeedback(id);
      setConfirmDeleteId(null);
    } catch {
      setMyItemsError('Não foi possível remover este envio.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 shrink-0">
              <MessageSquarePlus className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 id="feedback-modal-title" className="text-sm sm:text-base font-bold text-white truncate">
                Feedback &amp; Reportar Problema
              </h2>
              <p className="text-[11px] text-zinc-400 truncate">
                Envie bugs, fontes quebradas ou sugestões direto para correção
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
            aria-label="Fechar janela de feedback"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sub-navigation */}
        <div className="flex items-center gap-2 px-4 sm:px-6 border-b border-zinc-800/80 bg-zinc-950 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveView('form')}
            className={`py-2.5 px-3 border-b-2 transition-colors cursor-pointer ${
              activeView === 'form'
                ? 'border-rose-500 text-rose-400 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Novo Relato
          </button>
          <button
            type="button"
            onClick={() => setActiveView('mine')}
            className={`py-2.5 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeView === 'mine'
                ? 'border-rose-500 text-rose-400 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>Meus Envios</span>
            {user && (
              <span className="font-mono tabular-nums text-[11px] text-zinc-500">
                ({myItems.length})
              </span>
            )}
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {activeView === 'form' ? (
            submitSuccessId ? (
              <div className="p-6 rounded-2xl bg-zinc-900/60 border border-emerald-500/30 text-center space-y-4">
                <div className="mx-auto w-11 h-11 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white">Feedback registrado na fila</h3>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto">
                    Obrigado! Seu relato foi salvo e já aparece no painel de triagem para análise e correção. Você pode acompanhar o status em &ldquo;Meus Envios&rdquo;.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSubmitSuccessId(null)}
                    className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Enviar outro relato
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitSuccessId(null);
                      setActiveView('mine');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Acompanhar em Meus Envios
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Category selector */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-zinc-200">
                    Tipo de feedback
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(Object.keys(FEEDBACK_TYPE_META) as FeedbackType[]).map((key) => {
                      const meta = FEEDBACK_TYPE_META[key];
                      const selected = type === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setType(key)}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                            key === 'other' ? 'sm:col-span-2' : ''
                          } ${
                            selected
                              ? 'bg-rose-500/12 border-rose-500/60 text-white'
                              : 'bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 text-xs font-semibold">
                            {TYPE_ICONS[key]}
                            <span>{meta.label}</span>
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                            {meta.hint}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Title */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="fb-title" className="font-semibold text-zinc-200">
                      Título resumido
                    </label>
                    <span className="text-[11px] text-zinc-500 font-mono tabular-nums">
                      {title.trim().length}/{FEEDBACK_LIMITS.TITLE_MAX}
                    </span>
                  </div>
                  <input
                    id="fb-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value.slice(0, FEEDBACK_LIMITS.TITLE_MAX))}
                    placeholder="Ex: Busca por semelhantes não encontra obras isekai / Capítulo não carrega no MangaBall"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 focus:border-rose-500 focus:outline-none text-xs text-white placeholder:text-zinc-500"
                    required
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="fb-desc" className="font-semibold text-zinc-200">
                      O que aconteceu ou o que você sugere?
                    </label>
                    <span className="text-[11px] text-zinc-500 font-mono tabular-nums">
                      {description.trim().length}/{FEEDBACK_LIMITS.DESC_MAX}
                    </span>
                  </div>
                  <textarea
                    id="fb-desc"
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, FEEDBACK_LIMITS.DESC_MAX))}
                    placeholder="Descreva os passos para reproduzir, o nome do mangá/termo buscado ou a melhoria desejada..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 focus:border-rose-500 focus:outline-none text-xs text-white placeholder:text-zinc-500 resize-y"
                    required
                  />
                </div>

                {/* Context checkbox */}
                <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-1.5">
                  <label className="flex items-start gap-2.5 cursor-pointer text-xs text-zinc-200">
                    <input
                      type="checkbox"
                      checked={includeContext}
                      onChange={(e) => setIncludeContext(e.target.checked)}
                      className="mt-0.5 rounded border-zinc-700 bg-zinc-900 text-rose-500 focus:ring-rose-500"
                    />
                    <span>Anexar página atual e fontes ativas automaticamente para facilitar o diagnóstico</span>
                  </label>
                  {includeContext && (
                    <div className="pl-6 text-[11px] text-zinc-400 font-mono break-all">
                      {detectedContextUrl} · {detectedMangaContext}
                    </div>
                  )}
                </div>

                {/* Auth Gate if logged out */}
                {!user && (
                  <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs text-zinc-300">
                      <span className="font-semibold text-white block">Entre com o Google para enviar</span>
                      <span className="text-[11px] text-zinc-400">
                        Seu rascunho acima será mantido após o login.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleLogin}
                      disabled={isLoggingIn}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 shrink-0"
                    >
                      {isLoggingIn && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                      <span>Entrar com Google</span>
                    </button>
                  </div>
                )}

                {errorMessage && (
                  <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !user}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors cursor-pointer shadow-lg shadow-rose-950/40"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    <span>{isSubmitting ? 'Enviando...' : 'Enviar Feedback'}</span>
                  </button>
                </div>
              </form>
            )
          ) : (
            <div className="space-y-3">
              {!user ? (
                <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 text-center space-y-3">
                  <p className="text-xs text-zinc-400">
                    Entre com sua conta Google para acompanhar os feedbacks enviados por você.
                  </p>
                  <button
                    type="button"
                    onClick={handleLogin}
                    disabled={isLoggingIn}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {isLoggingIn && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                    <span>Entrar com Google</span>
                  </button>
                </div>
              ) : myItemsError ? (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                  <span>{myItemsError}</span>
                </div>
              ) : myItems.length === 0 ? (
                <div className="p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 text-center space-y-2">
                  <Clock className="h-6 w-6 text-zinc-500 mx-auto" />
                  <p className="text-xs font-medium text-zinc-300">Você ainda não enviou nenhum feedback</p>
                  <p className="text-[11px] text-zinc-500">
                    Quando enviar um relato ou sugestão, ele aparecerá aqui com o status de resolução.
                  </p>
                </div>
              ) : (
                myItems.map((item) => {
                  const statusMeta = FEEDBACK_STATUS_META[item.status];
                  const typeMeta = FEEDBACK_TYPE_META[item.type];
                  return (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="font-semibold text-zinc-300">{typeMeta.shortLabel}</span>
                          <span className="text-zinc-600" aria-hidden="true">·</span>
                          <span className={`font-semibold ${statusMeta.colorClass}`}>{statusMeta.label}</span>
                          <span className="text-zinc-600" aria-hidden="true">·</span>
                          <span className="text-zinc-500 font-mono tabular-nums">
                            {new Date(item.createdAtMs).toLocaleDateString('pt-BR')}
                          </span>
                        </div>

                        {item.status === 'open' && (
                          confirmDeleteId === item.id ? (
                            <div className="flex items-center gap-2 text-[11px]">
                              <button
                                type="button"
                                onClick={() => handleDeleteOpenItem(item.id)}
                                className="text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(item.id)}
                              className="text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                              title="Excluir envio ainda aberto"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )
                        )}
                      </div>

                      <h4 className="text-xs font-bold text-white">{item.title}</h4>
                      <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                        {item.description}
                      </p>

                      {item.adminNotes && (
                        <div className="mt-2 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300">
                          <span className="font-semibold text-emerald-400">Resposta: </span>
                          <span>{item.adminNotes}</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
