import fs from 'fs';
import path from 'path';
import {
  DynamicExtensionManifest,
  ExtensionRepo,
  RepoSyncSummary
} from '../../src/types/manga.js';
import { DynamicTemplateProvider, normalizeBaseUrl } from './DynamicTemplateProvider.js';
import { HttpError } from '../errors/HttpError.js';
import { globalCache } from '../cache/CacheService.js';
import { isSafeExternalRelayUrl } from '../services/ResidentialRelayService.js';
import type { SourceRegistry } from './SourceRegistry.js';

const BUILTIN_SOURCE_IDS = new Set([
  'comick',
  'mangadex',
  'weebcentral',
  'mangapill',
  'mangafire',
  'mangaball'
]);

export interface PersistedExtensionsState {
  repos: ExtensionRepo[];
  installed: DynamicExtensionManifest[];
}

export function sanitizeExtensionId(rawId: string, fallbackName?: string): string {
  const base = (rawId || fallbackName || 'custom-ext')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 40);

  const candidate = base || `ext-${Date.now().toString(36)}`;
  if (BUILTIN_SOURCE_IDS.has(candidate)) {
    return `ext-${candidate}`;
  }
  return candidate;
}

export function normalizeExtensionManifest(
  raw: any,
  repoUrl?: string
): DynamicExtensionManifest {
  if (!raw || typeof raw !== 'object') {
    throw new HttpError(400, 'Manifesto de extensão inválido.');
  }

  const name = String(raw.name || '').trim();
  const baseUrl = normalizeBaseUrl(String(raw.baseUrl || raw.websiteUrl || ''));
  const templateRaw = String(raw.template || 'madara').toLowerCase();
  const template: 'madara' | 'themesia' | 'custom_html' =
    templateRaw === 'themesia'
      ? 'themesia'
      : templateRaw === 'custom_html' || templateRaw === 'custom'
      ? 'custom_html'
      : 'madara';

  if (!name) {
    throw new HttpError(400, 'Nome da extensão é obrigatório.');
  }
  if (!baseUrl) {
    throw new HttpError(400, `URL base inválida para a extensão '${name}'. Use http:// ou https://.`);
  }
  if (template === 'custom_html') {
    const sel = raw.selectors;
    if (!sel || !sel.searchItem || !sel.chapterItem || !sel.pageImg) {
      throw new HttpError(
        400,
        `Extensão custom_html '${name}' precisa definir selectors.searchItem, chapterItem e pageImg.`
      );
    }
  }

  const id = sanitizeExtensionId(String(raw.id || ''), name);
  const lang = String(raw.lang || 'pt-br').toLowerCase();
  const languages = Array.isArray(raw.languages) && raw.languages.length > 0
    ? raw.languages.map((l: unknown) => String(l).toLowerCase())
    : [lang];

  return {
    id,
    name,
    baseUrl,
    defaultBaseUrl: normalizeBaseUrl(String(raw.defaultBaseUrl || baseUrl)) || baseUrl,
    template,
    version: String(raw.version || '1.0.0'),
    lang,
    languages,
    description: typeof raw.description === 'string' && raw.description.trim()
      ? raw.description.trim()
      : `Extensão ${template === 'madara' ? 'WP-Madara' : template === 'themesia' ? 'MangaThemesia' : 'Custom HTML'} (${baseUrl}).`,
    badge: typeof raw.badge === 'string' && raw.badge.trim() ? raw.badge.trim() : undefined,
    iconColor: typeof raw.iconColor === 'string' && raw.iconColor.trim() ? raw.iconColor.trim() : undefined,
    repoUrl: repoUrl || (typeof raw.repoUrl === 'string' ? raw.repoUrl : undefined),
    nsfw: Boolean(raw.nsfw),
    selectors: raw.selectors,
    headers: raw.headers && typeof raw.headers === 'object' ? raw.headers : undefined,
    installedAt: typeof raw.installedAt === 'number' ? raw.installedAt : Date.now(),
    updatedAt: Date.now()
  };
}

export function parseRepositoryPayload(payload: any, repoUrl: string): ExtensionRepo {
  const rawItems = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.extensions)
    ? payload.extensions
    : Array.isArray(payload?.sources)
    ? payload.sources
    : null;

  if (!rawItems) {
    throw new HttpError(
      400,
      'Formato de repositório JSON não reconhecido. Esperado array de extensões ou objeto com campo "extensions".'
    );
  }

  // Detect standard Android Mihon/Tachiyomi compiled APK repo format
  const looksLikeAndroidApkRepo =
    rawItems.length > 0 &&
    rawItems.every((item: any) => typeof item?.apk === 'string' && item.apk.endsWith('.apk') && !item.template && !item.selectors);

  if (looksLikeAndroidApkRepo) {
    throw new HttpError(
      400,
      'Este repositório é de extensões APK compiladas para Android (Mihon/Tachiyomi) e não contém regras JSON web. Use um repositório JSON de templates ou adicione o site manualmente.'
    );
  }

  const extensions: DynamicExtensionManifest[] = [];
  for (const item of rawItems) {
    try {
      extensions.push(normalizeExtensionManifest(item, repoUrl));
    } catch {
      // Skip malformed entry while keeping valid ones
    }
  }

  if (extensions.length === 0) {
    throw new HttpError(400, 'Nenhuma extensão compatível com templates (Madara / Themesia / Custom HTML) encontrada neste repositório.');
  }

  let defaultRepoName = 'Repositório Personalizado';
  try {
    defaultRepoName = new URL(repoUrl).hostname;
  } catch {
    // ignore
  }

  return {
    url: repoUrl,
    name: typeof payload?.name === 'string' && payload.name.trim() ? payload.name.trim() : defaultRepoName,
    description: typeof payload?.description === 'string' ? payload.description.trim() : undefined,
    lastSyncedAt: Date.now(),
    extensions
  };
}

export class ExtensionRepositoryService {
  private readonly storePath: string;
  private state: PersistedExtensionsState = { repos: [], installed: [] };
  private registry: SourceRegistry | null = null;

  constructor(customStorePath?: string) {
    this.storePath =
      customStorePath || path.resolve(process.cwd(), 'server', 'data', 'extensions.json');
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.state = {
            repos: Array.isArray(parsed.repos) ? parsed.repos : [],
            installed: Array.isArray(parsed.installed) ? parsed.installed : []
          };
        }
      }
    } catch (err) {
      console.warn('[ExtensionRepositoryService] Failed to read persisted extensions:', err);
      this.state = { repos: [], installed: [] };
    }
  }

  private saveToDisk(): void {
    try {
      const dir = path.dirname(this.storePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (err) {
      console.warn('[ExtensionRepositoryService] Failed to persist extensions:', err);
    }
  }

  private invalidateSourcesAndSearchCache(): void {
    globalCache.clear();
  }

  public attachRegistry(registry: SourceRegistry): void {
    this.registry = registry;
    for (const manifest of this.state.installed) {
      try {
        registry.registerSource(new DynamicTemplateProvider(manifest));
      } catch (err) {
        console.warn(`[ExtensionRepositoryService] Skipping invalid extension '${manifest.id}':`, err);
      }
    }
  }

  public getRepos(): ExtensionRepo[] {
    return this.state.repos.map(r => ({ ...r, extensions: [...r.extensions] }));
  }

  public getInstalledExtensions(): DynamicExtensionManifest[] {
    return this.state.installed.map(ext => ({ ...ext }));
  }

  public async addOrRefreshRepo(rawUrl: string): Promise<ExtensionRepo> {
    const cleanUrl = (rawUrl || '').trim();
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(cleanUrl);
    } catch {
      throw new HttpError(400, 'URL do repositório inválida. Informe um link completo https://...');
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new HttpError(400, 'Apenas URLs HTTP/HTTPS são suportadas para repositórios.');
    }
    if (!isSafeExternalRelayUrl(cleanUrl)) {
      throw new HttpError(400, 'URL do repositório bloqueada pela proteção de rede.');
    }

    let response: Response;
    try {
      response = await fetch(cleanUrl, {
        signal: AbortSignal.timeout(8000),
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'MangaReader/1.0'
        }
      });
    } catch (err) {
      throw new HttpError(502, `Não foi possível baixar o repositório: ${(err as Error).message}`);
    }

    if (!response.ok) {
      throw new HttpError(response.status, `Repositório respondeu com HTTP ${response.status}.`);
    }

    let payload: any;
    try {
      payload = await response.json();
    } catch {
      throw new HttpError(400, 'O conteúdo da URL não é um JSON válido.');
    }

    const repo = parseRepositoryPayload(payload, cleanUrl);
    const existingIdx = this.state.repos.findIndex(r => r.url === cleanUrl);
    if (existingIdx >= 0) {
      this.state.repos[existingIdx] = repo;
    } else {
      this.state.repos.unshift(repo);
    }
    this.saveToDisk();
    return repo;
  }

  public removeRepo(repoUrl: string): boolean {
    const before = this.state.repos.length;
    this.state.repos = this.state.repos.filter(r => r.url !== repoUrl);
    if (this.state.repos.length !== before) {
      this.saveToDisk();
      return true;
    }
    return false;
  }

  public installExtension(rawManifest: any): DynamicExtensionManifest {
    const manifest = normalizeExtensionManifest(rawManifest);
    if (BUILTIN_SOURCE_IDS.has(manifest.id)) {
      throw new HttpError(400, `Não é permitido sobrescrever a fonte nativa '${manifest.id}'.`);
    }

    const idx = this.state.installed.findIndex(e => e.id === manifest.id);
    if (idx >= 0) {
      manifest.installedAt = this.state.installed[idx].installedAt || manifest.installedAt;
      this.state.installed[idx] = manifest;
    } else {
      this.state.installed.push(manifest);
    }

    this.saveToDisk();
    if (this.registry) {
      this.registry.registerSource(new DynamicTemplateProvider(manifest));
    }
    this.invalidateSourcesAndSearchCache();
    return manifest;
  }

  public updateMirror(extensionId: string, newBaseUrl: string | null): DynamicExtensionManifest {
    if (BUILTIN_SOURCE_IDS.has(extensionId)) {
      throw new HttpError(400, `A fonte nativa '${extensionId}' não usa espelho configurável.`);
    }

    const idx = this.state.installed.findIndex(e => e.id === extensionId);
    if (idx === -1) {
      throw new HttpError(404, `Extensão instalada '${extensionId}' não encontrada.`);
    }

    const current = this.state.installed[idx];
    const targetUrl = newBaseUrl && newBaseUrl.trim()
      ? normalizeBaseUrl(newBaseUrl)
      : (current.defaultBaseUrl || current.baseUrl);

    if (!targetUrl) {
      throw new HttpError(400, 'URL do espelho inválida. Informe http:// ou https://.');
    }

    const updated: DynamicExtensionManifest = {
      ...current,
      baseUrl: targetUrl,
      websiteUrl: undefined as never, // clean object shape
      updatedAt: Date.now()
    } as DynamicExtensionManifest;
    delete (updated as any).websiteUrl;

    this.state.installed[idx] = updated;
    this.saveToDisk();

    if (this.registry) {
      const existingProvider = this.registry.getSource(extensionId);
      if (existingProvider && existingProvider instanceof DynamicTemplateProvider) {
        existingProvider.updateBaseUrl(targetUrl);
      } else {
        this.registry.registerSource(new DynamicTemplateProvider(updated));
      }
    }

    this.invalidateSourcesAndSearchCache();
    return updated;
  }

  public uninstallExtension(extensionId: string): boolean {
    if (BUILTIN_SOURCE_IDS.has(extensionId)) {
      throw new HttpError(400, `A fonte nativa '${extensionId}' não pode ser desinstalada (apenas desativada).`);
    }

    const before = this.state.installed.length;
    this.state.installed = this.state.installed.filter(e => e.id !== extensionId);
    const removed = this.state.installed.length !== before;

    if (this.registry) {
      this.registry.unregisterSource(extensionId);
    }

    if (removed) {
      this.saveToDisk();
      this.invalidateSourcesAndSearchCache();
    }
    return removed;
  }

  public applyRepoUpdates(repo: ExtensionRepo): RepoSyncSummary['extensionsUpdated'] {
    const updatedList: RepoSyncSummary['extensionsUpdated'] = [];
    let stateChanged = false;

    for (let i = 0; i < this.state.installed.length; i++) {
      const current = this.state.installed[i];
      const matchesRepo =
        current.repoUrl === repo.url ||
        repo.extensions.some(ext => ext.id === current.id);
      if (!matchesRepo) continue;

      const remote = repo.extensions.find(ext => ext.id === current.id);
      if (!remote) continue;

      const versionChanged = remote.version !== current.version;
      const defaultUrlChanged =
        (remote.defaultBaseUrl || remote.baseUrl) !== (current.defaultBaseUrl || current.baseUrl);
      const selectorsChanged =
        JSON.stringify(remote.selectors || null) !== JSON.stringify(current.selectors || null);

      if (!versionChanged && !defaultUrlChanged && !selectorsChanged) {
        continue;
      }

      const userHasCustomMirror =
        Boolean(current.defaultBaseUrl) && current.baseUrl !== current.defaultBaseUrl;
      const nextDefaultUrl = remote.defaultBaseUrl || remote.baseUrl;
      const nextBaseUrl = userHasCustomMirror ? current.baseUrl : remote.baseUrl;

      const upgraded: DynamicExtensionManifest = {
        ...current,
        ...remote,
        baseUrl: nextBaseUrl,
        defaultBaseUrl: nextDefaultUrl,
        repoUrl: repo.url,
        installedAt: current.installedAt,
        updatedAt: Date.now()
      };

      this.state.installed[i] = upgraded;
      stateChanged = true;

      if (this.registry) {
        this.registry.registerSource(new DynamicTemplateProvider(upgraded));
      }

      updatedList.push({
        id: upgraded.id,
        name: upgraded.name,
        fromVersion: current.version,
        toVersion: upgraded.version
      });
    }

    if (stateChanged) {
      this.saveToDisk();
      this.invalidateSourcesAndSearchCache();
    }

    return updatedList;
  }

  public async syncAllRepos(): Promise<RepoSyncSummary> {
    const reposSnapshot = [...this.state.repos];
    const extensionsUpdated: RepoSyncSummary['extensionsUpdated'] = [];
    const failedRepos: RepoSyncSummary['failedRepos'] = [];

    for (const repo of reposSnapshot) {
      try {
        const refreshed = await this.addOrRefreshRepo(repo.url);
        const applied = this.applyRepoUpdates(refreshed);
        extensionsUpdated.push(...applied);
      } catch (err) {
        failedRepos.push({
          url: repo.url,
          error: (err as Error).message || 'Falha ao sincronizar repositório'
        });
      }
    }

    return {
      reposChecked: reposSnapshot.length,
      extensionsUpdated,
      failedRepos
    };
  }

  public exportRepoJson(): {
    name: string;
    description: string;
    exportedAt: string;
    extensions: DynamicExtensionManifest[];
  } {
    return {
      name: 'MangaReader Extensões Exportadas',
      description: 'Repositório JSON compatível com MangaReader (Madara, Themesia e Custom HTML).',
      exportedAt: new Date().toISOString(),
      extensions: this.getInstalledExtensions()
    };
  }
}

export const extensionRepositoryService = new ExtensionRepositoryService();
