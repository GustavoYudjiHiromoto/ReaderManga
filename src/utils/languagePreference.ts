const PREFERRED_LANGUAGE_KEY = 'mr_preferred_language';
const LANGUAGE_CHANGE_EVENT = 'mr-preferred-language-changed';

export type LanguageOptionId = 'pt-br,en' | 'en' | 'pt-br' | 'all';

export const LANGUAGE_OPTIONS: Array<{
  id: LanguageOptionId;
  label: string;
  shortLabel: string;
  tag: string;
  desc: string;
}> = [
  {
    id: 'pt-br,en',
    label: 'PT-BR + Inglês',
    shortLabel: 'PT-BR + EN',
    tag: 'Padrão',
    desc: 'Prioriza português brasileiro e mantém inglês disponível'
  },
  {
    id: 'en',
    label: 'Apenas Inglês',
    shortLabel: 'Apenas EN',
    tag: 'EN',
    desc: 'Mostra e navega apenas obras e capítulos em inglês'
  },
  {
    id: 'pt-br',
    label: 'Apenas Português',
    shortLabel: 'Apenas PT-BR',
    tag: 'PT-BR',
    desc: 'Mostra e navega apenas traduções em português brasileiro'
  },
  {
    id: 'all',
    label: 'Todos os Idiomas',
    shortLabel: 'Todos',
    tag: 'Global',
    desc: 'Exibe obras e capítulos em qualquer idioma disponível'
  }
];

export function getPreferredLanguage(): string {
  if (typeof window === 'undefined') return 'pt-br,en';
  try {
    return localStorage.getItem(PREFERRED_LANGUAGE_KEY) || 'pt-br,en';
  } catch {
    return 'pt-br,en';
  }
}

export function setPreferredLanguage(lang: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PREFERRED_LANGUAGE_KEY, lang);
    window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: lang }));
  } catch {
    // ignore storage errors
  }
}

export function subscribePreferredLanguage(listener: (lang: string) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handleCustom = (e: Event) => {
    const detail = (e as CustomEvent<string>).detail;
    listener(detail || getPreferredLanguage());
  };
  const handleStorage = (e: StorageEvent) => {
    if (e.key === PREFERRED_LANGUAGE_KEY) {
      listener(e.newValue || 'pt-br,en');
    }
  };
  window.addEventListener(LANGUAGE_CHANGE_EVENT, handleCustom);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(LANGUAGE_CHANGE_EVENT, handleCustom);
    window.removeEventListener('storage', handleStorage);
  };
}

export function matchesLanguageFilter(lang?: string, filter: string = 'all'): boolean {
  const normalizedFilter = (filter || 'all').toLowerCase().trim();
  if (normalizedFilter === 'all') return true;

  const l = (lang || 'en').toLowerCase().trim();
  if (normalizedFilter === 'pt-br,en') {
    return l === 'pt-br' || l === 'pt' || l === 'pt_br' || l === 'en' || l === 'en-us' || l === 'default' || !l;
  }
  if (normalizedFilter === 'pt-br' || normalizedFilter === 'pt') {
    return l === 'pt-br' || l === 'pt' || l === 'pt_br';
  }
  if (normalizedFilter === 'en') {
    return l === 'en' || l === 'en-us' || l === 'default' || !l;
  }
  return l === normalizedFilter;
}

export function filterChaptersByLanguage<T extends { language?: string }>(
  chapters: T[],
  filter: string
): { chapters: T[]; isFallback: boolean } {
  if (!chapters || chapters.length === 0) {
    return { chapters: [], isFallback: false };
  }
  if (!filter || filter === 'all') {
    return { chapters, isFallback: false };
  }
  const matched = chapters.filter(ch => matchesLanguageFilter(ch.language, filter));
  if (matched.length > 0) {
    return { chapters: matched, isFallback: false };
  }
  return { chapters, isFallback: true };
}
