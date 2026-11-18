import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardCopy,
  Check,
  AlertCircle,
  MessageSquarePlus,
  Trash2,
  Save,
  Inbox
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import {
  FEEDBACK_LIMITS,
  FEEDBACK_STATUS_META,
  FEEDBACK_TYPE_META,
  FeedbackItem,
  FeedbackService,
  FeedbackStatus,
  FeedbackType,
  isFeedbackAdmin
} from '../services/feedbackService.js';

interface FeedbackAdminPanelProps {
  onOpenFeedbackModal: () => void;
}

export const FeedbackAdminPanel: React.FC<FeedbackAdminPanelProps> = ({ onOpenFeedbackModal }) => {
  const { user, loginWithGoogle } = useAuth();
  const isAdmin = isFeedbackAdmin(user?.email);

  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | FeedbackStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | FeedbackType>('all');

  const [draftEdits, setDraftEdits] = useState<Record<string, { status: FeedbackStatus; adminNotes: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [exportPreviewText, setExportPreviewText] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setItems([]);
      return;
    }

    if (isAdmin) {
      const unsub = FeedbackService.subscribeAllFeedbackForAdmin(
        (list) => {
          setItems(list);
          setLoadError(null);
        },
        (msg) => setLoadError(msg)
      );
      return () => unsub();
    }

    const unsub = FeedbackService.subscribeMyFeedback(
      user.uid,
      (list) => {
        setItems(list);
        setLoadError(null);
      },
      (msg) => setLoadError(msg)
    );
    return () => unsub();
  }, [user?.uid, isAdmin]);

  const counts = useMemo(() => {
    return {
      total: items.length,
      open: items.filter((i) => i.status === 'open').length,
      inProgress: items.filter((i) => i.status === 'in_progress').length,
      resolved: items.filter((i) => i.status === 'resolved').length
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      return true;
    });
  }, [items, statusFilter, typeFilter]);

  const copyTextSafely = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    } catch {
      setExportPreviewText(text);
    }
  };

  const handleCopyBatch = () => {
    const targetItems =
      statusFilter === 'all'
        ? filteredItems.filter((i) => i.status === 'open' || i.status === 'in_progress')
        : filteredItems;
    const listToExport = targetItems.length > 0 ? targetItems : filteredItems;
    const formatted = FeedbackService.formatFeedbackBatchForPrompt(listToExport);
    copyTextSafely(formatted, 'batch');
  };

  const handleSaveTriage = async (item: FeedbackItem) => {
    const edit = draftEdits[item.id] ?? {
      status: item.status,
      adminNotes: item.adminNotes || ''
    };
    try {
      setSavingId(item.id);
      await FeedbackService.adminUpdateFeedback(item.id, {
        status: edit.status,
        adminNotes: edit.adminNotes
      });
      setSavedId(item.id);
      setTimeout(() => setSavedId(null), 2000);
    } catch {
      setLoadError('Falha ao salvar atualização de triagem.');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await FeedbackService.deleteFeedback(id);
      setConfirmDeleteId(null);
    } catch {
      setLoadError('Falha ao excluir feedback.');
    }
  };

  if (!user) {
    return (
      <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-bold text-white">Feedback dos Usuários</h3>
          <p className="text-xs text-zinc-400">
            Entre com sua conta Google para enviar relatos de bugs, sugerir melhorias ou acompanhar os envios.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => loginWithGoogle()}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Entrar com o Google
          </button>
          <button
            type="button"
            onClick={onOpenFeedbackModal}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            Abrir Formulário de Feedback
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Header & Actions */}
      <div className="p-4 sm:p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">
              {isAdmin ? 'Central de Triagem de Feedbacks' : 'Meus Feedbacks Enviados'}
            </h3>
            <p className="text-xs text-zinc-400">
              {isAdmin
                ? 'Acompanhe relatos dos usuários online e copie os pendentes prontos para enviar para correção.'
                : 'Veja o andamento dos bugs, fontes quebradas ou sugestões que você enviou.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && items.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleCopyBatch}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer shadow-md shadow-rose-950/30"
                >
                  {copiedKey === 'batch' ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <ClipboardCopy className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {copiedKey === 'batch'
                      ? 'Copiado para colar no chat!'
                      : 'Copiar Pendentes para Correção'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target =
                      statusFilter === 'all'
                        ? filteredItems.filter((i) => i.status === 'open' || i.status === 'in_progress')
                        : filteredItems;
                    const text = FeedbackService.formatFeedbackBatchForPrompt(
                      target.length > 0 ? target : filteredItems
                    );
                    setExportPreviewText((prev) => (prev ? null : text));
                  }}
                  className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors cursor-pointer"
                >
                  {exportPreviewText ? 'Ocultar Prévia' : 'Ver Texto'}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onOpenFeedbackModal}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold border border-zinc-700 transition-colors cursor-pointer"
            >
              <MessageSquarePlus className="h-3.5 w-3.5 text-rose-400" />
              <span>Novo Feedback</span>
            </button>
          </div>
        </div>

        {/* Admin Summary Strip */}
        {isAdmin && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-zinc-850">
            <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
              <div className="text-[11px] text-zinc-400">Abertos</div>
              <div className="text-xl font-bold font-mono tabular-nums text-amber-300 mt-0.5">
                {counts.open}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
              <div className="text-[11px] text-zinc-400">Em análise</div>
              <div className="text-xl font-bold font-mono tabular-nums text-sky-300 mt-0.5">
                {counts.inProgress}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
              <div className="text-[11px] text-zinc-400">Resolvidos</div>
              <div className="text-xl font-bold font-mono tabular-nums text-emerald-300 mt-0.5">
                {counts.resolved}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
              <div className="text-[11px] text-zinc-400">Total</div>
              <div className="text-xl font-bold font-mono tabular-nums text-white mt-0.5">
                {counts.total}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-zinc-850">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {(
              [
                { id: 'all', label: 'Todos' },
                { id: 'open', label: 'Abertos' },
                { id: 'in_progress', label: 'Em análise' },
                { id: 'resolved', label: 'Resolvidos' },
                { id: 'wont_fix', label: 'Descartados' }
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStatusFilter(opt.id)}
                className={`px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                  statusFilter === opt.id
                    ? 'bg-rose-500/15 border-rose-500/50 text-rose-300 font-semibold'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | FeedbackType)}
            aria-label="Filtrar por categoria"
            className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:border-rose-500 focus:outline-none"
          >
            <option value="all">Todas as categorias</option>
            {(Object.keys(FEEDBACK_TYPE_META) as FeedbackType[]).map((k) => (
              <option key={k} value={k}>
                {FEEDBACK_TYPE_META[k].label}
              </option>
            ))}
          </select>
        </div>

        {exportPreviewText && (
          <div className="space-y-2 pt-2">
            <label className="text-[11px] font-semibold text-zinc-300 block">
              Resumo pronto para copiar e colar:
            </label>
            <textarea
              readOnly
              rows={8}
              value={exportPreviewText}
              onFocus={(e) => e.target.select()}
              className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
            />
          </div>
        )}
      </div>

      {loadError && (
        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* List */}
      {filteredItems.length === 0 ? (
        <div className="p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 text-center space-y-2">
          <Inbox className="h-7 w-7 text-zinc-600 mx-auto" />
          <p className="text-xs font-semibold text-zinc-300">Nenhum feedback encontrado nesse filtro</p>
          <p className="text-[11px] text-zinc-500">
            Assim que os leitores enviarem relatos pelo botão &ldquo;Enviar Feedback&rdquo;, eles aparecerão aqui em tempo real.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const typeMeta = FEEDBACK_TYPE_META[item.type];
            const statusMeta = FEEDBACK_STATUS_META[item.status];
            const editState = draftEdits[item.id] ?? {
              status: item.status,
              adminNotes: item.adminNotes || ''
            };

            return (
              <div
                key={item.id}
                className="p-4 sm:p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-zinc-200">{typeMeta.label}</span>
                    <span className="text-zinc-600" aria-hidden="true">·</span>
                    <span className={`font-semibold ${statusMeta.colorClass}`}>{statusMeta.label}</span>
                    <span className="text-zinc-600" aria-hidden="true">·</span>
                    <span className="text-zinc-400">
                      {item.authorName || 'Leitor'}
                      {isAdmin && item.authorEmail ? ` (${item.authorEmail})` : ''}
                    </span>
                    <span className="text-zinc-600" aria-hidden="true">·</span>
                    <span className="text-zinc-500 font-mono tabular-nums text-[11px]">
                      {new Date(item.createdAtMs).toLocaleString('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })}
                    </span>
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() =>
                        copyTextSafely(FeedbackService.formatFeedbackBatchForPrompt([item]), item.id)
                      }
                      className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      title="Copiar apenas este feedback"
                    >
                      {copiedKey === item.id ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copiado</span>
                        </>
                      ) : (
                        <>
                          <ClipboardCopy className="h-3.5 w-3.5" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  <h4 className="text-sm font-bold text-white">{item.title}</h4>
                  <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                    {item.description}
                  </p>
                </div>

                {(item.contextUrl || item.mangaContext) && (
                  <div className="text-[11px] text-zinc-400 font-mono bg-zinc-950/80 border border-zinc-850 rounded-lg px-3 py-2 break-all">
                    {[item.contextUrl, item.mangaContext].filter(Boolean).join(' · ')}
                  </div>
                )}

                {!isAdmin && item.adminNotes && (
                  <div className="text-xs text-zinc-300 bg-zinc-950/80 border border-zinc-850 rounded-xl p-3">
                    <span className="font-semibold text-emerald-400">Nota da moderação: </span>
                    <span>{item.adminNotes}</span>
                  </div>
                )}

                {isAdmin && (
                  <div className="pt-3 border-t border-zinc-850 flex flex-col lg:flex-row lg:items-center gap-2.5">
                    <select
                      value={editState.status}
                      onChange={(e) =>
                        setDraftEdits((prev) => ({
                          ...prev,
                          [item.id]: {
                            ...editState,
                            status: e.target.value as FeedbackStatus
                          }
                        }))
                      }
                      aria-label="Status do feedback"
                      className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:border-rose-500 focus:outline-none"
                    >
                      <option value="open">Aberto</option>
                      <option value="in_progress">Em análise</option>
                      <option value="resolved">Resolvido</option>
                      <option value="wont_fix">Descartado</option>
                    </select>

                    <input
                      type="text"
                      value={editState.adminNotes}
                      onChange={(e) =>
                        setDraftEdits((prev) => ({
                          ...prev,
                          [item.id]: {
                            ...editState,
                            adminNotes: e.target.value.slice(0, FEEDBACK_LIMITS.ADMIN_NOTES_MAX)
                          }
                        }))
                      }
                      placeholder="Nota de resposta opcional (visível para o usuário)..."
                      className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-white placeholder:text-zinc-500 focus:border-rose-500 focus:outline-none"
                    />

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSaveTriage(item)}
                        disabled={savingId === item.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-emerald-600 text-zinc-200 hover:text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {savedId === item.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        <span>
                          {savingId === item.id
                            ? 'Salvando...'
                            : savedId === item.id
                            ? 'Salvo'
                            : 'Salvar'}
                        </span>
                      </button>

                      {confirmDeleteId === item.id ? (
                        <div className="flex items-center gap-1.5 text-xs">
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1.5 text-zinc-400 hover:text-white cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                          title="Excluir feedback"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
