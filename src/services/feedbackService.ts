import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  Unsubscribe
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase.js';

export const ADMIN_EMAIL = 'natsugustavo@gmail.com';

export function isFeedbackAdmin(email?: string | null): boolean {
  return typeof email === 'string' && email.trim().toLowerCase() === ADMIN_EMAIL;
}

export type FeedbackType = 'bug' | 'source_broken' | 'recommendation' | 'suggestion' | 'other';
export type FeedbackStatus = 'open' | 'in_progress' | 'resolved' | 'wont_fix';

export const FEEDBACK_LIMITS = {
  ID_MAX: 128,
  AUTHOR_NAME_MAX: 128,
  AUTHOR_EMAIL_MAX: 256,
  TITLE_MIN: 3,
  TITLE_MAX: 140,
  DESC_MIN: 10,
  DESC_MAX: 2000,
  CONTEXT_URL_MAX: 512,
  MANGA_CONTEXT_MAX: 256,
  ADMIN_NOTES_MAX: 1000
} as const;

export const FEEDBACK_TYPE_META: Record<FeedbackType, { label: string; shortLabel: string; hint: string }> = {
  bug: {
    label: 'Bug / Erro no App',
    shortLabel: 'Bug',
    hint: 'Algo travou, deu erro visual ou não funcionou como esperado'
  },
  source_broken: {
    label: 'Fonte / Capítulo Quebrado',
    shortLabel: 'Fonte / Cap.',
    hint: 'Páginas não carregam, obra sumiu ou fonte fora do ar'
  },
  recommendation: {
    label: 'Busca / Recomendação',
    shortLabel: 'Recomendação',
    hint: 'Oráculo, Surpreenda-me ou busca de semelhantes trouxe algo fora do esperado'
  },
  suggestion: {
    label: 'Sugestão de Melhoria',
    shortLabel: 'Sugestão',
    hint: 'Ideia de novo recurso, filtro ou ajuste de usabilidade'
  },
  other: {
    label: 'Outros',
    shortLabel: 'Outros',
    hint: 'Dúvidas, comentários gerais ou assuntos fora das categorias acima'
  }
};

export const FEEDBACK_STATUS_META: Record<FeedbackStatus, { label: string; colorClass: string }> = {
  open: {
    label: 'Aberto',
    colorClass: 'text-amber-300'
  },
  in_progress: {
    label: 'Em análise',
    colorClass: 'text-sky-300'
  },
  resolved: {
    label: 'Resolvido',
    colorClass: 'text-emerald-300'
  },
  wont_fix: {
    label: 'Descartado',
    colorClass: 'text-zinc-400'
  }
};

export interface FeedbackItem {
  id: string;
  authorUid: string;
  authorName?: string;
  authorEmail?: string;
  type: FeedbackType;
  title: string;
  description: string;
  contextUrl?: string;
  mangaContext?: string;
  status: FeedbackStatus;
  adminNotes?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface SubmitFeedbackInput {
  type: FeedbackType;
  title: string;
  description: string;
  contextUrl?: string;
  mangaContext?: string;
}

function generateSafeFeedbackId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `fb_${ts}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, FEEDBACK_LIMITS.ID_MAX);
}

function toEpochMs(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (val && typeof (val as any).toMillis === 'function') {
    const ms = (val as any).toMillis();
    if (Number.isFinite(ms)) return ms;
  }
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function normalizeType(raw: unknown): FeedbackType {
  if (raw === 'bug' || raw === 'source_broken' || raw === 'recommendation' || raw === 'suggestion' || raw === 'other') {
    return raw;
  }
  return 'bug';
}

function normalizeStatus(raw: unknown): FeedbackStatus {
  if (raw === 'open' || raw === 'in_progress' || raw === 'resolved' || raw === 'wont_fix') {
    return raw;
  }
  return 'open';
}

function mapDocToFeedbackItem(docId: string, data: Record<string, any>): FeedbackItem {
  return {
    id: typeof data.id === 'string' && data.id ? data.id : docId,
    authorUid: String(data.authorUid || ''),
    authorName: typeof data.authorName === 'string' ? data.authorName : undefined,
    authorEmail: typeof data.authorEmail === 'string' ? data.authorEmail : undefined,
    type: normalizeType(data.type),
    title: String(data.title || ''),
    description: String(data.description || ''),
    contextUrl: typeof data.contextUrl === 'string' ? data.contextUrl : undefined,
    mangaContext: typeof data.mangaContext === 'string' ? data.mangaContext : undefined,
    status: normalizeStatus(data.status),
    adminNotes: typeof data.adminNotes === 'string' ? data.adminNotes : undefined,
    createdAtMs: toEpochMs(data.createdAt),
    updatedAtMs: toEpochMs(data.updatedAt)
  };
}

export const FeedbackService = {
  async submitFeedback(input: SubmitFeedbackInput): Promise<string> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Faça login com o Google para enviar seu feedback.');
    }
    if (!currentUser.emailVerified) {
      throw new Error('Sua conta Google precisa estar com e-mail verificado para enviar feedback.');
    }

    const cleanTitle = input.title.trim().slice(0, FEEDBACK_LIMITS.TITLE_MAX);
    const cleanDescription = input.description.trim().slice(0, FEEDBACK_LIMITS.DESC_MAX);

    if (cleanTitle.length < FEEDBACK_LIMITS.TITLE_MIN) {
      throw new Error(`O título precisa ter pelo menos ${FEEDBACK_LIMITS.TITLE_MIN} caracteres.`);
    }
    if (cleanDescription.length < FEEDBACK_LIMITS.DESC_MIN) {
      throw new Error(`A descrição precisa ter pelo menos ${FEEDBACK_LIMITS.DESC_MIN} caracteres.`);
    }

    const safeAuthorUid = currentUser.uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, FEEDBACK_LIMITS.ID_MAX);
    const id = generateSafeFeedbackId();
    const path = `feedback/${id}`;

    const payload: Record<string, any> = {
      id,
      authorUid: safeAuthorUid,
      type: normalizeType(input.type),
      title: cleanTitle,
      description: cleanDescription,
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    if (currentUser.displayName && currentUser.displayName.trim()) {
      payload.authorName = currentUser.displayName.trim().slice(0, FEEDBACK_LIMITS.AUTHOR_NAME_MAX);
    }
    if (currentUser.email && currentUser.email.trim()) {
      payload.authorEmail = currentUser.email.trim().slice(0, FEEDBACK_LIMITS.AUTHOR_EMAIL_MAX);
    }
    if (input.contextUrl && input.contextUrl.trim()) {
      payload.contextUrl = input.contextUrl.trim().slice(0, FEEDBACK_LIMITS.CONTEXT_URL_MAX);
    }
    if (input.mangaContext && input.mangaContext.trim()) {
      payload.mangaContext = input.mangaContext.trim().slice(0, FEEDBACK_LIMITS.MANGA_CONTEXT_MAX);
    }

    try {
      await setDoc(doc(db, 'feedback', id), payload);
      return id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  subscribeMyFeedback(
    uid: string,
    onData: (items: FeedbackItem[]) => void,
    onError?: (message: string) => void
  ): Unsubscribe {
    if (!uid) {
      onData([]);
      return () => {};
    }

    // Single-field where query avoids requiring a manual composite index; sorted client-side
    const q = query(collection(db, 'feedback'), where('authorUid', '==', uid));
    return onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs
          .map((d) => mapDocToFeedbackItem(d.id, d.data()))
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        onData(items);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'feedback');
        } catch {
          onError?.('Não foi possível carregar seus feedbacks enviados.');
        }
      }
    );
  },

  subscribeAllFeedbackForAdmin(
    onData: (items: FeedbackItem[]) => void,
    onError?: (message: string) => void
  ): Unsubscribe {
    const q = query(
      collection(db, 'feedback'),
      orderBy('createdAt', 'desc'),
      limit(200)
    );
    return onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((d) => mapDocToFeedbackItem(d.id, d.data()));
        onData(items);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'feedback');
        } catch {
          onError?.('Sem permissão ou falha ao carregar a fila de feedbacks.');
        }
      }
    );
  },

  async adminUpdateFeedback(
    id: string,
    updates: { status: FeedbackStatus; adminNotes?: string }
  ): Promise<void> {
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, FEEDBACK_LIMITS.ID_MAX);
    const path = `feedback/${safeId}`;
    const cleanNotes = (updates.adminNotes ?? '').trim().slice(0, FEEDBACK_LIMITS.ADMIN_NOTES_MAX);

    try {
      await updateDoc(doc(db, 'feedback', safeId), {
        status: normalizeStatus(updates.status),
        adminNotes: cleanNotes,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async deleteFeedback(id: string): Promise<void> {
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, FEEDBACK_LIMITS.ID_MAX);
    const path = `feedback/${safeId}`;
    try {
      await deleteDoc(doc(db, 'feedback', safeId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  formatFeedbackBatchForPrompt(items: FeedbackItem[]): string {
    if (items.length === 0) {
      return 'Nenhum feedback selecionado no momento.';
    }

    const lines: string[] = [
      `Relatório de Feedbacks do MangaReader (${items.length} ${items.length === 1 ? 'item' : 'itens'}):`,
      ''
    ];

    items.forEach((item, index) => {
      const typeLabel = FEEDBACK_TYPE_META[item.type]?.label || item.type;
      const statusLabel = FEEDBACK_STATUS_META[item.status]?.label || item.status;
      const dateStr = new Date(item.createdAtMs).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short'
      });

      lines.push(`${index + 1}. [${typeLabel}] ${item.title}`);
      lines.push(`   - Status: ${statusLabel} | Data: ${dateStr} | Autor: ${item.authorName || 'Leitor'}`);
      if (item.contextUrl) {
        lines.push(`   - Página/Rota: ${item.contextUrl}`);
      }
      if (item.mangaContext) {
        lines.push(`   - Contexto: ${item.mangaContext}`);
      }
      lines.push(`   - Descrição: ${item.description}`);
      if (item.adminNotes) {
        lines.push(`   - Nota Admin: ${item.adminNotes}`);
      }
      lines.push('');
    });

    return lines.join('\n').trim();
  }
};
