import React, { useState, useEffect } from 'react';
import {
  X,
  Blocks,
  RefreshCw,
  Check,
  AlertTriangle,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  Activity,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Globe,
  ShieldAlert,
  FolderGit2,
  Search,
  Edit3,
  Code2,
  Download,
  Compass,
  Wifi,
  Copy,
  KeyRound,
  Terminal,
  Power,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import {
  DynamicExtensionManifest,
  ExtensionRepo,
  MangaSourceInfo,
  MirrorProbeCandidate,
  RelayMode,
  RelayStatus,
  SiteDetectionResult,
  SourcePingResult
} from '../types/manga.js';
import { ExtensionService, FALLBACK_SOURCES_META } from '../services/extensionService.js';
import { MangaApi } from '../services/api.js';

interface ExtensionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSourceSettingsChanged?: () => void;
  onExploreSource?: (sourceId: string) => void;
}

type ModalTab = 'installed' | 'repos' | 'relay';

const SAMPLE_REPO_JSON = `{
  "name": "Meu Repositório MangaReader",
  "extensions": [
    {
      "id": "ext-exemplo-madara",
      "name": "Scan Exemplo",
      "baseUrl": "https://exemplo.com",
      "template": "madara",
      "lang": "pt-br",
      "version": "1.0.0"
    }
  ]
}`;

export const ExtensionsModal: React.FC<ExtensionsModalProps> = ({
  isOpen,
  onClose,
  onSourceSettingsChanged,
  onExploreSource
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('installed');
  const [sources, setSources] = useState<MangaSourceInfo[]>(() => [...FALLBACK_SOURCES_META]);
  const [repos, setRepos] = useState<ExtensionRepo[]>([]);
  const [installedManifests, setInstalledManifests] = useState<DynamicExtensionManifest[]>([]);
  const [loading, setLoading] = useState(false);
  const [pingingId, setPingingId] = useState<string | null>(null);
  const [pingingAll, setPingingAll] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [configs, setConfigs] = useState(() => ExtensionService.getConfigs());
  const [pingResults, setPingResults] = useState<Record<string, SourcePingResult>>(() =>
    ExtensionService.getAllPingResults()
  );

  // Mirror editor state
  const [editingMirrorId, setEditingMirrorId] = useState<string | null>(null);
  const [mirrorInput, setMirrorInput] = useState('');
  const [savingMirrorId, setSavingMirrorId] = useState<string | null>(null);
  const [confirmUninstallId, setConfirmUninstallId] = useState<string | null>(null);

  // Repo management state
  const [repoUrlInput, setRepoUrlInput] = useState('');
  const [addingRepo, setAddingRepo] = useState(false);
  const [refreshingRepoUrl, setRefreshingRepoUrl] = useState<string | null>(null);
  const [repoSearchQuery, setRepoSearchQuery] = useState('');
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [showJsonHelp, setShowJsonHelp] = useState(false);

  // Manual source form state
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualBaseUrl, setManualBaseUrl] = useState('');
  const [manualTemplate, setManualTemplate] = useState<'madara' | 'themesia' | 'custom_html'>('madara');
  const [manualLang, setManualLang] = useState('pt-br');
  const [manualNsfw, setManualNsfw] = useState(false);
  const [customSearchPath, setCustomSearchPath] = useState('/?s={query}');
  const [customSearchItem, setCustomSearchItem] = useState('.manga-card');
  const [customTitleSel, setCustomTitleSel] = useState('h3 a');
  const [customLinkSel, setCustomLinkSel] = useState('a');
  const [customCoverSel, setCustomCoverSel] = useState('img');
  const [customChapterItem, setCustomChapterItem] = useState('.chapter-item a');
  const [customPageImg, setCustomPageImg] = useState('.reader-pages img');
  const [installingManual, setInstallingManual] = useState(false);

  // Residential IP Relay state
  const [relayStatus, setRelayStatus] = useState<RelayStatus | null>(null);
  const [customProxyInput, setCustomProxyInput] = useState('');
  const [savingRelayConfig, setSavingRelayConfig] = useState(false);
  const [rotatingToken, setRotatingToken] = useState(false);
  const [testingRelay, setTestingRelay] = useState(false);
  const [relayTestUrl, setRelayTestUrl] = useState('https://mangafire.to');
  const [relayTestResult, setRelayTestResult] = useState<{
    ok: boolean;
    status: number;
    latencyMs: number;
    bytes: number;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showExternalRelay, setShowExternalRelay] = useState(false);

  // Passo 4: Auto-detection, Live Selector Test, Repo Auto-Sync & Mirror Probing
  const [autoDetectUrl, setAutoDetectUrl] = useState('');
  const [detectingSite, setDetectingSite] = useState(false);
  const [detectionResult, setDetectionResult] = useState<SiteDetectionResult | null>(null);
  const [installingDetected, setInstallingDetected] = useState(false);
  const [testingManual, setTestingManual] = useState(false);
  const [manualTestResult, setManualTestResult] = useState<SiteDetectionResult | null>(null);
  const [syncingAllRepos, setSyncingAllRepos] = useState(false);
  const [probingMirrorId, setProbingMirrorId] = useState<string | null>(null);
  const [mirrorCandidates, setMirrorCandidates] = useState<Record<string, MirrorProbeCandidate[]>>({});

  const showSuccess = (msg: string) => {
    setErrorNotice(null);
    setSuccessNotice(msg);
    setTimeout(() => setSuccessNotice(prev => (prev === msg ? null : prev)), 4000);
  };

  const showError = (msg: string) => {
    setSuccessNotice(null);
    setErrorNotice(msg);
    setTimeout(() => setErrorNotice(prev => (prev === msg ? null : prev)), 6000);
  };

  useEffect(() => {
    const unsub = ExtensionService.subscribe(() => {
      setConfigs(ExtensionService.getConfigs());
      setPingResults(ExtensionService.getAllPingResults());
    });
    return unsub;
  }, []);

  const refreshAllData = async () => {
    setLoading(true);
    try {
      const [sourcesData, reposData, relayData] = await Promise.all([
        ExtensionService.getSourcesMeta(),
        ExtensionService.getRepos().catch(() => []),
        MangaApi.getRelayStatus().catch(() => null)
      ]);
      setSources(sourcesData);
      setRepos(reposData);
      if (relayData) {
        setRelayStatus(relayData);
        setCustomProxyInput(relayData.customProxyUrl || '');
        if (relayData.customProxyUrl) {
          setShowExternalRelay(true);
        }
      }
      setConfigs(ExtensionService.getConfigs());
      setPingResults(ExtensionService.getAllPingResults());
      const installedRes = await fetch('/api/extensions/installed')
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null);
      if (installedRes?.data) {
        setInstalledManifests(installedRes.data);
      }
    } catch (err) {
      console.warn('Failed to load extensions modal data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    refreshAllData();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'relay') return;
    const timer = setInterval(() => {
      MangaApi.getRelayStatus()
        .then(status => setRelayStatus(status))
        .catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const sortedSources = [...sources].sort((a, b) => {
    const pA = configs[a.id]?.priority ?? 99;
    const pB = configs[b.id]?.priority ?? 99;
    return pA - pB;
  });

  const enabledCount = sortedSources.filter(s => configs[s.id]?.enabled ?? true).length;
  const installedMap = new Map(installedManifests.map(m => [m.id, m]));
  const repoCatalogEntries = repos.flatMap(repo =>
    repo.extensions.map(ext => ({ ...ext, repoName: repo.name }))
  );

  const filteredRepoEntries = repoCatalogEntries.filter(ext => {
    if (!repoSearchQuery.trim()) return true;
    const q = repoSearchQuery.toLowerCase();
    return (
      ext.name.toLowerCase().includes(q) ||
      ext.baseUrl.toLowerCase().includes(q) ||
      ext.lang.toLowerCase().includes(q) ||
      ext.template.toLowerCase().includes(q)
    );
  });

  const handleToggle = (sourceId: string) => {
    const result = ExtensionService.toggleSource(sourceId);
    if (!result.success && result.message) {
      showError(result.message);
      return;
    }
    const isNowEnabled = ExtensionService.isSourceEnabled(sourceId);
    showSuccess(`Extensão ${sourceId} ${isNowEnabled ? 'ativada' : 'desativada'}.`);
    onSourceSettingsChanged?.();
  };

  const handleMovePriority = (sourceId: string, direction: 'up' | 'down') => {
    ExtensionService.movePriority(sourceId, direction);
    onSourceSettingsChanged?.();
  };

  const handlePingOne = async (sourceId: string) => {
    setPingingId(sourceId);
    try {
      const res = await ExtensionService.pingSource(sourceId);
      setPingResults(prev => ({ ...prev, [sourceId]: res }));
    } finally {
      setPingingId(null);
    }
  };

  const handlePingAll = async () => {
    setPingingAll(true);
    try {
      const res = await ExtensionService.pingAllSources();
      setPingResults(res);
    } finally {
      setPingingAll(false);
    }
  };

  const handleEnableAll = () => {
    ExtensionService.enableAll();
    showSuccess('Todas as extensões instaladas foram ativadas.');
    onSourceSettingsChanged?.();
  };

  const handleResetDefaults = () => {
    ExtensionService.resetToDefaults();
    showSuccess('Prioridades das fontes nativas restauradas para o padrão.');
    onSourceSettingsChanged?.();
  };

  const handleStartEditMirror = (source: MangaSourceInfo) => {
    setEditingMirrorId(source.id);
    setMirrorInput(source.baseUrl || source.websiteUrl || '');
  };

  const handleSaveMirror = async (sourceId: string, resetDefault = false) => {
    setSavingMirrorId(sourceId);
    try {
      const updated = await ExtensionService.updateMirror(sourceId, resetDefault ? null : mirrorInput);
      setEditingMirrorId(null);
      await refreshAllData();
      showSuccess(`Espelho de ${updated.name} atualizado para ${updated.baseUrl}. Sondando conexão...`);
      onSourceSettingsChanged?.();
      handlePingOne(sourceId);
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setSavingMirrorId(null);
    }
  };

  const handleUninstall = async (sourceId: string, sourceName: string) => {
    try {
      await ExtensionService.uninstallExtension(sourceId);
      setConfirmUninstallId(null);
      await refreshAllData();
      showSuccess(`Extensão "${sourceName}" removida.`);
      onSourceSettingsChanged?.();
    } catch (err) {
      showError((err as Error).message);
    }
  };

  const handleAddRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrlInput.trim()) return;
    setAddingRepo(true);
    try {
      const repo = await ExtensionService.addRepo(repoUrlInput.trim());
      setRepoUrlInput('');
      await refreshAllData();
      showSuccess(`Repositório "${repo.name}" sincronizado com ${repo.extensions.length} extensões.`);
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setAddingRepo(false);
    }
  };

  const handleRefreshRepo = async (url: string) => {
    setRefreshingRepoUrl(url);
    try {
      const repo = await ExtensionService.addRepo(url);
      await refreshAllData();
      showSuccess(`Repositório "${repo.name}" atualizado (${repo.extensions.length} extensões).`);
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setRefreshingRepoUrl(null);
    }
  };

  const handleRemoveRepo = async (url: string, name: string) => {
    try {
      await ExtensionService.removeRepo(url);
      await refreshAllData();
      showSuccess(`Repositório "${name}" removido.`);
    } catch (err) {
      showError((err as Error).message);
    }
  };

  const handleInstallFromRepo = async (manifest: DynamicExtensionManifest) => {
    setInstallingId(manifest.id);
    try {
      const installed = await ExtensionService.installExtension(manifest);
      await refreshAllData();
      showSuccess(`Extensão "${installed.name}" instalada e ativada!`);
      onSourceSettingsChanged?.();
      handlePingOne(installed.id);
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setInstallingId(null);
    }
  };

  const handleInstallManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setInstallingManual(true);
    try {
      const payload: Partial<DynamicExtensionManifest> = {
        name: manualName.trim(),
        baseUrl: manualBaseUrl.trim(),
        template: manualTemplate,
        lang: manualLang,
        nsfw: manualNsfw,
        version: '1.0.0'
      };

      if (manualTemplate === 'custom_html') {
        payload.selectors = {
          searchPath: customSearchPath.trim() || '/?s={query}',
          searchItem: customSearchItem.trim(),
          title: customTitleSel.trim() || 'a',
          link: customLinkSel.trim() || 'a',
          cover: customCoverSel.trim() || 'img',
          chapterItem: customChapterItem.trim(),
          pageImg: customPageImg.trim()
        };
      }

      const installed = await ExtensionService.installExtension(payload);
      setManualName('');
      setManualBaseUrl('');
      setShowManualForm(false);
      setActiveTab('installed');
      await refreshAllData();
      showSuccess(`Fonte "${installed.name}" (${installed.template}) adicionada! Testando conectividade...`);
      onSourceSettingsChanged?.();
      handlePingOne(installed.id);
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setInstallingManual(false);
    }
  };

  const handleChangeRelayMode = async (mode: RelayMode) => {
    setSavingRelayConfig(true);
    try {
      const updated = await MangaApi.updateRelayConfig({ mode });
      setRelayStatus(updated);
      const label =
        mode === 'off'
          ? 'Ponte Residencial desativada.'
          : mode === 'always'
          ? 'Modo Sempre Ativo configurado para fontes protegidas.'
          : 'Modo Automático configurado: a ponte só entra em ação quando houver bloqueio Cloudflare/403.';
      showSuccess(label);
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setSavingRelayConfig(false);
    }
  };

  const handleSaveCustomProxy = async (e: React.FormEvent, clear = false) => {
    e.preventDefault();
    setSavingRelayConfig(true);
    try {
      const updated = await MangaApi.updateRelayConfig({
        customProxyUrl: clear ? null : customProxyInput.trim()
      });
      setRelayStatus(updated);
      setCustomProxyInput(updated.customProxyUrl || '');
      showSuccess(
        clear
          ? 'URL da ponte externa removida.'
          : 'Ponte externa salva. Requisições bloqueadas podem usá-la automaticamente.'
      );
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setSavingRelayConfig(false);
    }
  };

  const handleRotateRelayToken = async () => {
    setRotatingToken(true);
    try {
      const updated = await MangaApi.rotateRelayToken();
      setRelayStatus(updated);
      showSuccess('Token rotacionado com sucesso. Baixe o script atualizado se for reconectar.');
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setRotatingToken(false);
    }
  };

  const handleDisconnectBridge = async () => {
    try {
      const updated = await MangaApi.disconnectRelay();
      setRelayStatus(updated);
      showSuccess('Ponte residencial desconectada do servidor.');
    } catch (err) {
      showError((err as Error).message);
    }
  };

  const handleTestRelay = async () => {
    setTestingRelay(true);
    setRelayTestResult(null);
    try {
      const result = await MangaApi.testRelay(relayTestUrl.trim() || 'https://example.com');
      setRelayTestResult(result);
      showSuccess(`Teste concluído: HTTP ${result.status} em ${result.latencyMs}ms.`);
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setTestingRelay(false);
    }
  };

  const handleCopyText = async (key: string, text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 2500);
      }
    } catch {
      // ignore clipboard permissions issues
    }
  };

  const handleAutoDetectSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!autoDetectUrl.trim()) return;
    setDetectingSite(true);
    setDetectionResult(null);
    try {
      const res = await ExtensionService.detectSite({ url: autoDetectUrl.trim() });
      setDetectionResult(res);
      if (res.detected) {
        showSuccess(
          `Motor ${res.template.toUpperCase()} detectado em ${res.suggestedName} (${res.probeSearchCount} obra(s) na busca de teste).`
        );
      } else if (res.cloudflareBlocked) {
        showError('Site protegido por Cloudflare no IP do servidor. Use a Ponte Residencial ou outro espelho.');
      } else {
        showError(res.error || 'Não foi possível extrair obras automaticamente. Ajuste no formulário manual abaixo.');
      }
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setDetectingSite(false);
    }
  };

  const handleInstallDetected = async () => {
    if (!detectionResult) return;
    setInstallingDetected(true);
    try {
      const installed = await ExtensionService.installExtension({
        name: detectionResult.suggestedName,
        baseUrl: detectionResult.baseUrl,
        template: detectionResult.template,
        lang: detectionResult.lang,
        selectors: detectionResult.template === 'custom_html' ? detectionResult.selectors : undefined,
        version: '1.0.0'
      });
      setAutoDetectUrl('');
      setDetectionResult(null);
      setActiveTab('installed');
      await refreshAllData();
      showSuccess(`Extensão "${installed.name}" instalada com 1 clique!`);
      onSourceSettingsChanged?.();
      handlePingOne(installed.id);
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setInstallingDetected(false);
    }
  };

  const handleTestManualSelectors = async () => {
    if (!manualBaseUrl.trim()) {
      showError('Informe a URL Base do site antes de testar os seletores.');
      return;
    }
    setTestingManual(true);
    setManualTestResult(null);
    try {
      const res = await ExtensionService.detectSite({
        url: manualBaseUrl.trim(),
        template: manualTemplate,
        selectors:
          manualTemplate === 'custom_html'
            ? {
                searchPath: customSearchPath.trim() || '/?s={query}',
                searchItem: customSearchItem.trim(),
                title: customTitleSel.trim() || 'a',
                link: customLinkSel.trim() || 'a',
                cover: customCoverSel.trim() || 'img',
                chapterItem: customChapterItem.trim(),
                pageImg: customPageImg.trim()
              }
            : undefined
      });
      setManualTestResult(res);
      if (!manualName.trim() && res.suggestedName) {
        setManualName(res.suggestedName);
      }
      if (res.probeSearchCount > 0) {
        showSuccess(`Teste ao vivo extraiu ${res.probeSearchCount} obra(s)!`);
      } else {
        showError(res.error || 'Nenhuma obra extraída no teste ao vivo.');
      }
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setTestingManual(false);
    }
  };

  const handleSyncAllRepos = async () => {
    setSyncingAllRepos(true);
    try {
      const summary = await ExtensionService.syncAllRepos();
      await refreshAllData();
      if (summary.extensionsUpdated.length > 0) {
        onSourceSettingsChanged?.();
        showSuccess(
          `${summary.reposChecked} repositório(s) sincronizado(s) e ${summary.extensionsUpdated.length} extensão(ões) atualizada(s).`
        );
      } else {
        showSuccess(`${summary.reposChecked} repositório(s) sincronizado(s). Todas as extensões já estão atualizadas.`);
      }
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setSyncingAllRepos(false);
    }
  };

  const handleProbeMirrors = async (sourceId: string) => {
    setProbingMirrorId(sourceId);
    try {
      const candidates = await ExtensionService.probeMirrors(sourceId, mirrorInput.trim() || undefined);
      setMirrorCandidates(prev => ({ ...prev, [sourceId]: candidates }));
      const working = candidates.filter(c => c.reachable);
      if (working.length > 0) {
        showSuccess(`${working.length} espelho(s) alternativo(s) respondendo online.`);
      } else {
        showError('Nenhum espelho alternativo respondeu diretamente.');
      }
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setProbingMirrorId(null);
    }
  };

  const renderPingDiagnostic = (ping: SourcePingResult | undefined, isPinging: boolean, sourceId: string) => {
    if (isPinging) {
      return (
        <span className="flex items-center gap-1.5 text-xs text-zinc-400 whitespace-nowrap">
          <Activity className="h-3.5 w-3.5 text-rose-400 animate-spin" />
          <span>Sondando...</span>
        </span>
      );
    }

    if (!ping) {
      return (
        <button
          type="button"
          onClick={() => handlePingOne(sourceId)}
          className="text-xs text-zinc-400 hover:text-zinc-100 flex items-center gap-1.5 transition-colors cursor-pointer px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 whitespace-nowrap"
          title="Testar conexão com esta fonte"
        >
          <Activity className="h-3.5 w-3.5" />
          <span>Testar</span>
        </button>
      );
    }

    if (ping.status === 'online' && !ping.errorCode) {
      return (
        <button
          type="button"
          onClick={() => handlePingOne(sourceId)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/40 text-emerald-300 border border-emerald-700/40 text-xs font-mono tabular-nums cursor-pointer hover:bg-emerald-950/70 transition-colors whitespace-nowrap"
          title="Clique para testar novamente"
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          <span>{ping.latencyMs}ms</span>
        </button>
      );
    }

    if (ping.status === 'degraded' || ping.errorCode === 'layout') {
      return (
        <button
          type="button"
          onClick={() => handlePingOne(sourceId)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/40 text-amber-300 border border-amber-700/40 text-xs cursor-pointer hover:bg-amber-950/70 transition-colors whitespace-nowrap"
          title={ping.error || 'Resposta lenta ou sem resultados extraídos. Clique para retestar.'}
        >
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="font-mono tabular-nums">
            {ping.errorCode === 'layout' ? 'Layout / 0 itens' : `${ping.latencyMs}ms`}
          </span>
        </button>
      );
    }

    const label =
      ping.errorCode === 'cloudflare'
        ? 'Cloudflare'
        : ping.errorCode === 'ratelimit'
        ? 'Limite 429'
        : 'Offline';

    return (
      <button
        type="button"
        onClick={() => handlePingOne(sourceId)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/40 text-rose-300 border border-rose-700/40 text-xs cursor-pointer hover:bg-rose-950/70 transition-colors whitespace-nowrap"
        title={ping.error || 'Falha de conexão. Clique para testar novamente.'}
      >
        {ping.errorCode === 'cloudflare' ? (
          <ShieldAlert className="h-3.5 w-3.5 text-rose-400 shrink-0" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
        )}
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 shrink-0">
              <Blocks className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-zinc-100 truncate">
                Extensões & Repositórios
              </h2>
              <p className="text-xs text-zinc-400 truncate">
                Gerencie fontes nativas, instale repositórios JSON e configure espelhos de domínio
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
            aria-label="Fechar gerenciador de extensões"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 pt-3 pb-2 border-b border-zinc-800 bg-zinc-900/20 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-900 border border-zinc-800">
            <button
              type="button"
              onClick={() => setActiveTab('installed')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'installed'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>Instaladas</span>
              <span className="font-mono tabular-nums text-[11px] text-zinc-400">
                {enabledCount}/{sortedSources.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('repos')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'repos'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <FolderGit2 className="h-3.5 w-3.5 text-rose-400" />
              <span>Repositórios & Fontes</span>
              {repos.length > 0 && (
                <span className="font-mono tabular-nums text-[11px] text-zinc-400">
                  {repoCatalogEntries.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('relay')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'relay'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Wifi
                className={`h-3.5 w-3.5 ${
                  relayStatus?.bridgeOnline ? 'text-emerald-400' : 'text-zinc-400'
                }`}
              />
              <span>Ponte Residencial</span>
              {relayStatus?.bridgeOnline && (
                <span
                  className="h-2 w-2 rounded-full bg-emerald-400"
                  title="Ponte Residencial conectada"
                />
              )}
            </button>
          </div>

          {activeTab === 'installed' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePingAll}
                disabled={pingingAll || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 transition-colors cursor-pointer disabled:opacity-50 text-xs font-medium whitespace-nowrap"
                title="Testar latência e conectividade de todas as fontes"
              >
                <RefreshCw className={`h-3.5 w-3.5 text-rose-400 ${pingingAll ? 'animate-spin' : ''}`} />
                <span>{pingingAll ? 'Testando...' : 'Testar Conexões'}</span>
              </button>

              {enabledCount < sortedSources.length && (
                <button
                  type="button"
                  onClick={handleEnableAll}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-emerald-400 border border-zinc-800 transition-colors cursor-pointer text-xs font-medium whitespace-nowrap"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Ativar Todas</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleResetDefaults}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer text-xs whitespace-nowrap"
                title="Restaurar prioridades padrão"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Padrão</span>
              </button>
            </div>
          )}
        </div>

        {/* Notices */}
        {errorNotice && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-rose-950/40 border border-rose-700/50 text-rose-200 text-xs flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
            <span className="leading-relaxed">{errorNotice}</span>
          </div>
        )}

        {successNotice && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-emerald-950/40 border border-emerald-700/50 text-emerald-200 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
            <span className="leading-relaxed">{successNotice}</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading && sources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-rose-400" />
              <span className="text-xs">Carregando extensões...</span>
            </div>
          ) : activeTab === 'installed' ? (
            <>
              {(() => {
                const health = ExtensionService.getHealthSummary(sortedSources.map(s => s.id));
                const tested = health.online + health.degraded + health.offline;
                if (tested === 0) return null;
                return (
                  <div className="px-3.5 py-2 rounded-xl bg-zinc-900/45 border border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                      <span className="font-medium text-zinc-200">Monitor de Saúde</span>
                      <span aria-hidden="true" className="text-zinc-700">·</span>
                      <span className="text-emerald-400 font-mono">{health.online} online</span>
                      {health.degraded > 0 && (
                        <>
                          <span aria-hidden="true" className="text-zinc-700">·</span>
                          <span className="text-amber-300 font-mono">{health.degraded} lentas</span>
                        </>
                      )}
                      {health.offline > 0 && (
                        <>
                          <span aria-hidden="true" className="text-zinc-700">·</span>
                          <span className="text-rose-400 font-mono">
                            {health.offline} offline{health.cloudflare > 0 ? ` (${health.cloudflare} Cloudflare)` : ''}
                          </span>
                        </>
                      )}
                    </div>
                    {health.cloudflare > 0 && !relayStatus?.bridgeOnline && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('relay')}
                        className="text-xs text-rose-400 hover:text-rose-300 font-medium cursor-pointer"
                      >
                        Desbloquear com Ponte Residencial →
                      </button>
                    )}
                  </div>
                );
              })()}
              {sortedSources.map((source, index) => {
                const isEnabled = configs[source.id]?.enabled ?? true;
                const isPinging = pingingId === source.id || pingingAll;
                const ping = pingResults[source.id];
                const isEditingMirror = editingMirrorId === source.id;
                const isConfirmingUninstall = confirmUninstallId === source.id;

                return (
                  <div
                    key={source.id}
                    className={`p-4 rounded-xl border transition-colors ${
                      isEnabled
                        ? 'bg-zinc-900/55 border-zinc-800 hover:border-zinc-700'
                        : 'bg-zinc-950/70 border-zinc-900 opacity-65'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Priority Arrows */}
                        <div className="flex flex-col items-center justify-center gap-0.5 pt-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleMovePriority(source.id, 'up')}
                            disabled={index === 0}
                            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-20 cursor-pointer transition-colors"
                            title="Aumentar prioridade"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <span className="text-[11px] font-mono tabular-nums font-semibold text-zinc-500">
                            {index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleMovePriority(source.id, 'down')}
                            disabled={index === sortedSources.length - 1}
                            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-20 cursor-pointer transition-colors"
                            title="Diminuir prioridade"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Metadata (clean editorial text hierarchy) */}
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-sm font-semibold text-zinc-100">
                              {source.name}
                            </span>
                            <span className="text-xs font-mono tabular-nums text-zinc-500">
                              v{source.version}
                            </span>
                            <span aria-hidden="true" className="text-zinc-700">·</span>
                            <span className="text-xs text-zinc-400">
                              {source.isDynamic
                                ? `Template ${source.template === 'themesia' ? 'Themesia' : source.template === 'custom_html' ? 'Custom' : 'Madara'}`
                                : 'Provedor Nativo'}
                            </span>
                            {source.languages && source.languages.length > 0 && (
                              <>
                                <span aria-hidden="true" className="text-zinc-700">·</span>
                                <span className="text-xs font-mono text-zinc-400">
                                  {source.languages.join(', ')}
                                </span>
                              </>
                            )}
                          </div>

                          <p className="text-xs text-zinc-400 leading-relaxed">
                            {source.description}
                          </p>

                          {/* Links & Explore / Mirror / Uninstall actions */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-xs">
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                if (onExploreSource) {
                                  onExploreSource(source.id);
                                } else if (typeof window !== 'undefined') {
                                  window.dispatchEvent(new CustomEvent('explore-source', { detail: { sourceId: source.id } }));
                                }
                              }}
                              className="inline-flex items-center gap-1 text-rose-400 hover:text-rose-300 font-medium transition-colors cursor-pointer whitespace-nowrap"
                              title={`Explorar catálogo de ${source.name}`}
                            >
                              <Compass className="h-3 w-3" />
                              <span>Explorar catálogo</span>
                            </button>

                            {(source.baseUrl || source.websiteUrl) && (
                              <a
                                href={source.baseUrl || source.websiteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-zinc-400 hover:text-rose-400 transition-colors"
                              >
                                <Globe className="h-3 w-3" />
                                <span className="truncate max-w-[220px]">
                                  {(source.baseUrl || source.websiteUrl || '').replace(/^https?:\/\//, '')}
                                </span>
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            )}

                            {source.supportsMirrorEdit && (
                              <button
                                type="button"
                                onClick={() =>
                                  isEditingMirror ? setEditingMirrorId(null) : handleStartEditMirror(source)
                                }
                                className="inline-flex items-center gap-1 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                              >
                                <Edit3 className="h-3 w-3 text-rose-400" />
                                <span>{isEditingMirror ? 'Fechar espelho' : 'Editar espelho'}</span>
                              </button>
                            )}

                            {source.isDynamic && (
                              isConfirmingUninstall ? (
                                <span className="inline-flex items-center gap-2 text-rose-300">
                                  <span>Remover fonte?</span>
                                  <button
                                    type="button"
                                    onClick={() => handleUninstall(source.id, source.name)}
                                    className="font-semibold text-rose-400 hover:underline cursor-pointer"
                                  >
                                    Sim, remover
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmUninstallId(null)}
                                    className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmUninstallId(source.id)}
                                  className="inline-flex items-center gap-1 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>Desinstalar</span>
                                </button>
                              )
                            )}
                          </div>

                          {/* Cloudflare / Error Diagnostic Hint */}
                          {ping && ping.status === 'offline' && ping.error && (
                            <p className="text-[11px] text-rose-300/90 pt-1">
                              {ping.errorCode === 'cloudflare' ? (
                                <>
                                  Diagnóstico: Domínio protegido por desafio Cloudflare no IP do servidor. Troque o espelho, use fontes alternativas ou{' '}
                                  <button
                                    type="button"
                                    onClick={() => setActiveTab('relay')}
                                    className="underline text-rose-200 hover:text-white cursor-pointer"
                                  >
                                    ative a Ponte Residencial opcional
                                  </button>
                                  .
                                </>
                              ) : (
                                `Diagnóstico: ${ping.error}`
                              )}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right Controls: Diagnostic Ping + Enable Switch */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800 shrink-0">
                        {renderPingDiagnostic(ping, isPinging, source.id)}

                        <button
                          type="button"
                          onClick={() => handleToggle(source.id)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
                            isEnabled ? 'bg-rose-500' : 'bg-zinc-800'
                          }`}
                          role="switch"
                          aria-checked={isEnabled}
                          title={isEnabled ? `Desativar ${source.name}` : `Ativar ${source.name}`}
                        >
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                              isEnabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Inline Mirror Editor */}
                    {isEditingMirror && (
                      <div className="mt-3 pt-3 border-t border-zinc-800 space-y-2.5">
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <input
                            type="url"
                            value={mirrorInput}
                            onChange={e => setMirrorInput(e.target.value)}
                            placeholder="https://novo-dominio-espelho.com"
                            className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500 font-mono"
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={savingMirrorId === source.id || !mirrorInput.trim()}
                              onClick={() => handleSaveMirror(source.id, false)}
                              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                            >
                              {savingMirrorId === source.id ? 'Salvando...' : 'Salvar Espelho'}
                            </button>
                            <button
                              type="button"
                              disabled={probingMirrorId === source.id}
                              onClick={() => handleProbeMirrors(source.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                              title="Testa domínios comuns (.com, .net, .org, .to...) para este site"
                            >
                              {probingMirrorId === source.id ? 'Sondando...' : 'Procurar Espelho'}
                            </button>
                            {source.defaultBaseUrl && source.defaultBaseUrl !== source.baseUrl && (
                              <button
                                type="button"
                                disabled={savingMirrorId === source.id}
                                onClick={() => handleSaveMirror(source.id, true)}
                                className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition-colors cursor-pointer whitespace-nowrap"
                              >
                                Restaurar Padrão
                              </button>
                            )}
                          </div>
                        </div>

                        {mirrorCandidates[source.id] && mirrorCandidates[source.id].length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="text-zinc-500">Candidatos:</span>
                            {mirrorCandidates[source.id].map(cand => (
                              <button
                                key={cand.url}
                                type="button"
                                onClick={() => setMirrorInput(cand.url)}
                                className={`px-2 py-1 rounded border font-mono cursor-pointer transition-colors ${
                                  cand.reachable
                                    ? 'bg-emerald-950/35 border-emerald-700/50 text-emerald-300 hover:bg-emerald-950/60'
                                    : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                                }`}
                              >
                                {cand.url.replace(/^https?:\/\//, '')} ·{' '}
                                {cand.reachable
                                  ? `${cand.latencyMs}ms`
                                  : cand.cloudflare
                                  ? 'CF'
                                  : cand.status || 'off'}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          ) : activeTab === 'repos' ? (
            <div className="space-y-5">
              {/* Passo 4: 1-Click URL Site Auto-Detector */}
              <div className="p-4 rounded-xl bg-zinc-900/55 border border-zinc-800 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-rose-400" />
                    <span>Adicionar Qualquer Scan pela URL (Detecção Automática)</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Cole apenas o endereço inicial do site. O servidor identifica o motor (Madara, Themesia ou Custom HTML) e testa busca e capítulos antes de instalar.
                  </p>
                </div>

                <form onSubmit={handleAutoDetectSite} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    required
                    value={autoDetectUrl}
                    onChange={e => setAutoDetectUrl(e.target.value)}
                    placeholder="https://scansite.com"
                    className="flex-1 px-3.5 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500 font-mono"
                  />
                  <button
                    type="submit"
                    disabled={detectingSite || !autoDetectUrl.trim()}
                    className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Activity className={`h-3.5 w-3.5 ${detectingSite ? 'animate-spin' : ''}`} />
                    <span>{detectingSite ? 'Analisando...' : 'Detectar & Testar'}</span>
                  </button>
                </form>

                {detectionResult && (
                  <div className="p-3.5 rounded-xl bg-zinc-950/90 border border-zinc-800 space-y-2.5 text-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-semibold text-zinc-100">
                            {detectionResult.suggestedName}
                          </span>
                          <span aria-hidden="true" className="text-zinc-700">·</span>
                          <span className="font-mono text-rose-400 uppercase">
                            {detectionResult.template}
                          </span>
                          <span aria-hidden="true" className="text-zinc-700">·</span>
                          <span className="font-mono text-zinc-400">
                            {detectionResult.lang}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400">
                          {detectionResult.signals.join(' · ')}
                          {detectionResult.probeChapterCount !== undefined
                            ? ` · ${detectionResult.probeChapterCount} capítulos no 1º resultado`
                            : ''}
                        </p>
                      </div>

                      {detectionResult.cloudflareBlocked ? (
                        <button
                          type="button"
                          onClick={() => setActiveTab('relay')}
                          className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-rose-300 font-medium cursor-pointer whitespace-nowrap"
                        >
                          Abrir Ponte Residencial
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={installingDetected}
                          onClick={handleInstallDetected}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          {installingDetected ? 'Instalando...' : 'Instalar com 1 Clique'}
                        </button>
                      )}
                    </div>

                    {detectionResult.probeSampleTitles.length > 0 && (
                      <p className="text-[11px] text-zinc-400">
                        Amostras extraídas:{' '}
                        <span className="text-zinc-200">
                          {detectionResult.probeSampleTitles.join(' · ')}
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Add Repository URL Form */}
              <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100">
                      Adicionar Repositório por URL
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Cole o link direto de um arquivo <code className="font-mono text-zinc-300">repo.json</code> compatível com templates web (Madara, Themesia ou Custom HTML).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowJsonHelp(prev => !prev)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 cursor-pointer whitespace-nowrap"
                  >
                    <Code2 className="h-3.5 w-3.5 text-rose-400" />
                    <span>{showJsonHelp ? 'Ocultar esquema' : 'Ver esquema JSON'}</span>
                  </button>
                </div>

                {showJsonHelp && (
                  <pre className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-300 overflow-x-auto leading-relaxed">
                    {SAMPLE_REPO_JSON}
                  </pre>
                )}

                <form onSubmit={handleAddRepo} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    required
                    value={repoUrlInput}
                    onChange={e => setRepoUrlInput(e.target.value)}
                    placeholder="https://raw.githubusercontent.com/.../repo.json"
                    className="flex-1 px-3.5 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500 font-mono"
                  />
                  <button
                    type="submit"
                    disabled={addingRepo || !repoUrlInput.trim()}
                    className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    {addingRepo ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    <span>{addingRepo ? 'Sincronizando...' : 'Adicionar Repositório'}</span>
                  </button>
                </form>
              </div>

              {/* Manual Site Installation Toggle & Form */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/35 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowManualForm(prev => !prev)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-zinc-900/60 transition-colors cursor-pointer"
                >
                  <div>
                    <span className="text-sm font-semibold text-zinc-100 block">
                      Adicionar Site Manualmente (Sem Repositório)
                    </span>
                    <span className="text-xs text-zinc-400">
                      Conecte qualquer scan compatível com WP-Madara, MangaThemesia ou seletores CSS próprios
                    </span>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-zinc-400 transition-transform ${
                      showManualForm ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {showManualForm && (
                  <form onSubmit={handleInstallManual} className="p-4 pt-3 border-t border-zinc-800 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-300 mb-1">
                          Nome da Fonte
                        </label>
                        <input
                          type="text"
                          required
                          value={manualName}
                          onChange={e => setManualName(e.target.value)}
                          placeholder="Ex: Scan BR Favorita"
                          className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-300 mb-1">
                          URL Base do Site
                        </label>
                        <input
                          type="url"
                          required
                          value={manualBaseUrl}
                          onChange={e => setManualBaseUrl(e.target.value)}
                          placeholder="https://scansite.com"
                          className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500 font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-300 mb-1">
                          Motor / Template
                        </label>
                        <select
                          value={manualTemplate}
                          onChange={e => setManualTemplate(e.target.value as 'madara' | 'themesia' | 'custom_html')}
                          className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-rose-500"
                        >
                          <option value="madara">WP-Madara (Mais comum)</option>
                          <option value="themesia">MangaThemesia</option>
                          <option value="custom_html">Custom HTML (CSS)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-300 mb-1">
                          Idioma Principal
                        </label>
                        <select
                          value={manualLang}
                          onChange={e => setManualLang(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-rose-500"
                        >
                          <option value="pt-br">Português (pt-br)</option>
                          <option value="en">Inglês (en)</option>
                          <option value="es">Espanhol (es)</option>
                          <option value="ja">Japonês (ja)</option>
                        </select>
                      </div>
                      <div className="flex items-end pb-2">
                        <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={manualNsfw}
                            onChange={e => setManualNsfw(e.target.checked)}
                            className="rounded border-zinc-700 bg-zinc-950 text-rose-500 focus:ring-rose-500"
                          />
                          <span>Catálogo adulto (+18)</span>
                        </label>
                      </div>
                    </div>

                    {manualTemplate === 'custom_html' && (
                      <div className="pt-2 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] text-zinc-400 mb-1">Rota de Busca</label>
                          <input
                            type="text"
                            value={customSearchPath}
                            onChange={e => setCustomSearchPath(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-400 mb-1">Seletor do Card de Busca</label>
                          <input
                            type="text"
                            required
                            value={customSearchItem}
                            onChange={e => setCustomSearchItem(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-400 mb-1">Seletor do Título</label>
                          <input
                            type="text"
                            value={customTitleSel}
                            onChange={e => setCustomTitleSel(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-400 mb-1">Seletor do Link</label>
                          <input
                            type="text"
                            value={customLinkSel}
                            onChange={e => setCustomLinkSel(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-400 mb-1">Seletor da Capa</label>
                          <input
                            type="text"
                            value={customCoverSel}
                            onChange={e => setCustomCoverSel(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-400 mb-1">Seletor de Capítulos</label>
                          <input
                            type="text"
                            required
                            value={customChapterItem}
                            onChange={e => setCustomChapterItem(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] text-zinc-400 mb-1">Seletor de Páginas (IMG)</label>
                          <input
                            type="text"
                            required
                            value={customPageImg}
                            onChange={e => setCustomPageImg(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                          />
                        </div>
                      </div>
                    )}

                    {manualTestResult && (
                      <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300 space-y-1">
                        <div>
                          {manualTestResult.signals.join(' · ')}
                        </div>
                        {manualTestResult.probeSampleTitles.length > 0 && (
                          <div className="text-emerald-300">
                            Títulos extraídos: {manualTestResult.probeSampleTitles.join(' · ')}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap justify-end gap-2 pt-1">
                      <button
                        type="button"
                        disabled={testingManual || !manualBaseUrl.trim()}
                        onClick={handleTestManualSelectors}
                        className="px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {testingManual ? 'Testando...' : 'Testar Seletores ao Vivo'}
                      </button>
                      <button
                        type="submit"
                        disabled={installingManual || !manualName.trim() || !manualBaseUrl.trim()}
                        className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {installingManual ? 'Instalando...' : 'Instalar e Testar Conexão'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Active Repositories List & Installed JSON Export */}
              {(repos.length > 0 || installedManifests.length > 0) && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Repositórios Sincronizados ({repos.length})
                    </h3>
                    <div className="flex items-center gap-2">
                      {repos.length > 0 && (
                        <button
                          type="button"
                          disabled={syncingAllRepos}
                          onClick={handleSyncAllRepos}
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`h-3 w-3 text-rose-400 ${syncingAllRepos ? 'animate-spin' : ''}`} />
                          <span>{syncingAllRepos ? 'Sincronizando...' : 'Atualizar Todos'}</span>
                        </button>
                      )}
                      {installedManifests.length > 0 && (
                        <a
                          href="/api/extensions/export-repo"
                          download="mangareader-repo.json"
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-200 flex items-center gap-1.5"
                        >
                          <Download className="h-3 w-3 text-rose-400" />
                          <span>Exportar JSON</span>
                        </a>
                      )}
                    </div>
                  </div>
                  {repos.length > 0 && (
                    <div className="space-y-2">
                      {repos.map(repo => (
                      <div
                        key={repo.url}
                        className="p-3 rounded-xl bg-zinc-900/45 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-semibold text-zinc-100 truncate">{repo.name}</span>
                            <span className="text-zinc-600">·</span>
                            <span className="font-mono tabular-nums text-zinc-400">
                              {repo.extensions.length} extensões
                            </span>
                          </div>
                          <p className="text-[11px] font-mono text-zinc-500 truncate mt-0.5">
                            {repo.url}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={refreshingRepoUrl === repo.url}
                            onClick={() => handleRefreshRepo(repo.url)}
                            className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <RefreshCw
                              className={`h-3 w-3 text-rose-400 ${
                                refreshingRepoUrl === repo.url ? 'animate-spin' : ''
                              }`}
                            />
                            <span>Atualizar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveRepo(repo.url, repo.name)}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                            title="Remover repositório"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  )}
                </div>
              )}

              {/* Available Extensions from Repos */}
              <div className="space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Catálogo de Extensões dos Repositórios
                  </h3>
                  {repoCatalogEntries.length > 0 && (
                    <div className="relative w-full sm:w-56">
                      <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={repoSearchQuery}
                        onChange={e => setRepoSearchQuery(e.target.value)}
                        placeholder="Filtrar por nome, idioma..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  )}
                </div>

                {repoCatalogEntries.length === 0 ? (
                  <div className="p-8 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 text-center space-y-1.5">
                    <FolderGit2 className="h-7 w-7 text-zinc-600 mx-auto" />
                    <p className="text-sm font-medium text-zinc-300">
                      Nenhum repositório adicionado ainda
                    </p>
                    <p className="text-xs text-zinc-500 max-w-md mx-auto">
                      Adicione uma URL de repositório JSON acima ou cadastre um site manualmente pelo painel acima.
                    </p>
                  </div>
                ) : filteredRepoEntries.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-6 text-center">
                    Nenhuma extensão corresponde a "{repoSearchQuery}".
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filteredRepoEntries.map(ext => {
                      const existing = installedMap.get(ext.id);
                      const needsUpdate = existing && existing.version !== ext.version;
                      return (
                        <div
                          key={`${ext.repoUrl}-${ext.id}`}
                          className="p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="text-sm font-semibold text-zinc-100">{ext.name}</span>
                              <span className="text-xs font-mono tabular-nums text-zinc-500">
                                v{ext.version}
                              </span>
                              <span className="text-zinc-700">·</span>
                              <span className="text-xs text-zinc-400">{ext.template}</span>
                              <span className="text-zinc-700">·</span>
                              <span className="text-xs font-mono text-zinc-400">{ext.lang}</span>
                            </div>
                            <p className="text-xs text-zinc-500 truncate font-mono">{ext.baseUrl}</p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {existing && !needsUpdate ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-950/35 border border-emerald-700/40 text-xs font-medium text-emerald-300">
                                <Check className="h-3.5 w-3.5" />
                                <span>Instalada</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={installingId === ext.id}
                                onClick={() => handleInstallFromRepo(ext)}
                                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                              >
                                <Download className="h-3.5 w-3.5" />
                                <span>
                                  {installingId === ext.id
                                    ? 'Instalando...'
                                    : needsUpdate
                                    ? 'Atualizar'
                                    : 'Instalar'}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Opt-in Reassurance Banner */}
              <div className="p-4 rounded-xl bg-zinc-900/55 border border-zinc-800 flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <p className="font-semibold text-zinc-100">
                    100% opcional — o aplicativo continua funcionando normalmente sem ela
                  </p>
                  <p className="text-zinc-400 leading-relaxed">
                    Fontes abertas (MangaDex, Comick, WeebCentral, MangaPill) não precisam da ponte. Conecte seu IP residencial apenas se quiser desbloquear scans com bloqueio Cloudflare/datacenter (como MangaFire, MangaBall ou sites Madara/Themesia protegidos).
                  </p>
                </div>
              </div>

              {/* Live Status Card */}
              <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        relayStatus?.bridgeOnline
                          ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]'
                          : relayStatus?.customProxyConfigured
                          ? 'bg-amber-400'
                          : 'bg-zinc-600'
                      }`}
                    />
                    <span className="text-sm font-semibold text-zinc-100">
                      {relayStatus?.bridgeOnline
                        ? `Conectada (${relayStatus.clientLabel || 'Dispositivo Local'})`
                        : relayStatus?.customProxyConfigured
                        ? 'Ponte Externa Configurada (FlareSolverr)'
                        : 'Aguardando conexão opcional'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    {relayStatus?.bridgeOnline
                      ? `Requisições atendidas: ${relayStatus.stats.requestsSucceeded} sucesso / ${relayStatus.stats.requestsServed} total`
                      : 'Sem conexão ativa no momento. Quando um site retornar 403/Cloudflare, o servidor usará a ponte assim que você conectá-la.'}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {relayStatus?.bridgeOnline && (
                    <button
                      type="button"
                      onClick={handleDisconnectBridge}
                      className="px-3 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-xs text-rose-300 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Power className="h-3.5 w-3.5" />
                      <span>Desconectar</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleTestRelay}
                    disabled={
                      testingRelay ||
                      (!relayStatus?.bridgeOnline && !relayStatus?.customProxyConfigured)
                    }
                    className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
                    title="Testa se a ponte consegue alcançar a URL informada"
                  >
                    <Activity className={`h-3.5 w-3.5 ${testingRelay ? 'animate-spin' : ''}`} />
                    <span>{testingRelay ? 'Testando...' : 'Testar Ponte'}</span>
                  </button>
                </div>
              </div>

              {/* Test URL & Result */}
              {(relayStatus?.bridgeOnline || relayStatus?.customProxyConfigured) && (
                <div className="p-3.5 rounded-xl bg-zinc-900/35 border border-zinc-800 flex flex-col sm:flex-row sm:items-center gap-2.5">
                  <label className="text-xs text-zinc-400 shrink-0">URL de teste:</label>
                  <input
                    type="url"
                    value={relayTestUrl}
                    onChange={e => setRelayTestUrl(e.target.value)}
                    placeholder="https://mangafire.to"
                    className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:outline-none focus:border-rose-500"
                  />
                  {relayTestResult && (
                    <span className="text-xs font-mono tabular-nums text-emerald-300 shrink-0">
                      HTTP {relayTestResult.status} · {relayTestResult.latencyMs}ms ·{' '}
                      {Math.round(relayTestResult.bytes / 1024)}KB
                    </span>
                  )}
                </div>
              )}

              {/* Routing Mode Policy */}
              <div className="p-4 rounded-xl bg-zinc-900/45 border border-zinc-800 space-y-2.5">
                <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Política de Roteamento
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(
                    [
                      {
                        id: 'fallback',
                        title: 'Ao Bloquear (Recomendado)',
                        desc: 'Tenta direto no servidor e só usa seu IP se der Cloudflare/403.'
                      },
                      {
                        id: 'always',
                        title: 'Sempre em Fontes Protegidas',
                        desc: 'Envia MangaFire, MangaBall e scans dinâmicas direto pela ponte.'
                      },
                      {
                        id: 'off',
                        title: 'Desativada',
                        desc: 'Ignora a ponte mesmo se algum cliente estiver em aberto.'
                      }
                    ] as const
                  ).map(opt => {
                    const selected = (relayStatus?.mode || 'fallback') === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={savingRelayConfig}
                        onClick={() => handleChangeRelayMode(opt.id)}
                        className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                          selected
                            ? 'bg-rose-500/10 border-rose-500/50 text-zinc-100'
                            : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                        }`}
                      >
                        <div className="text-xs font-semibold">{opt.title}</div>
                        <div className="text-[11px] text-zinc-400 mt-1 leading-snug">
                          {opt.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Connect Script Card (Zero-Dependency Node 18+) */}
              <div className="p-4 rounded-xl bg-zinc-900/45 border border-zinc-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                      <Terminal className="h-4 w-4 text-rose-400" />
                      <span>Conectar pelo seu PC, Mac ou Celular (Termux / Node 18+)</span>
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Script único sem dependências externas. Ele faz apenas requisições de saída com seu token privado.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={`/api/relay/script?baseUrl=${encodeURIComponent(
                        typeof window !== 'undefined' ? window.location.origin : ''
                      )}`}
                      download="mangareader-bridge.mjs"
                      className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Baixar Script (.mjs)</span>
                    </a>
                    <button
                      type="button"
                      disabled={rotatingToken}
                      onClick={handleRotateRelayToken}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="Gera um novo token e invalida scripts antigos"
                    >
                      <KeyRound className="h-3.5 w-3.5 text-rose-400" />
                      <span>Rotacionar Token</span>
                    </button>
                  </div>
                </div>

                {(() => {
                  const origin =
                    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
                  const oneLiner = `curl -sL "${origin}/api/relay/script?baseUrl=${encodeURIComponent(
                    origin
                  )}" -o mangareader-bridge.mjs && node mangareader-bridge.mjs`;
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
                        <code className="text-[11px] font-mono text-zinc-300 truncate">
                          {oneLiner}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopyText('oneliner', oneLiner)}
                          className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-200 flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          {copiedKey === 'oneliner' ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-400" />
                              <span>Copiado</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copiar comando</span>
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        Ou baixe o arquivo acima e execute <code className="font-mono text-zinc-300">node mangareader-bridge.mjs</code>. Você pode fechar a janela a qualquer momento.
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Optional External FlareSolverr / Relay URL */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/35 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowExternalRelay(prev => !prev)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-zinc-900/60 transition-colors cursor-pointer"
                >
                  <div>
                    <span className="text-xs font-semibold text-zinc-200 block">
                      Avançado: Conectar FlareSolverr / Ponte Externa Própria (Opcional)
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      Se você já hospeda um container FlareSolverr próprio na rede ou VPS residencial
                    </span>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-zinc-400 transition-transform ${
                      showExternalRelay ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {showExternalRelay && (
                  <form
                    onSubmit={e => handleSaveCustomProxy(e, false)}
                    className="p-4 pt-3 border-t border-zinc-800 flex flex-col sm:flex-row gap-2"
                  >
                    <input
                      type="url"
                      value={customProxyInput}
                      onChange={e => setCustomProxyInput(e.target.value)}
                      placeholder="https://meu-flaresolverr.exemplo.com"
                      className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                    />
                    <button
                      type="submit"
                      disabled={savingRelayConfig}
                      className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      Salvar URL
                    </button>
                    {relayStatus?.customProxyUrl && (
                      <button
                        type="button"
                        disabled={savingRelayConfig}
                        onClick={e => handleSaveCustomProxy(e, true)}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs cursor-pointer whitespace-nowrap"
                      >
                        Remover
                      </button>
                    )}
                  </form>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-zinc-800 bg-zinc-900/50 flex items-center justify-between text-xs">
          <span className="text-zinc-500">
            Fontes protegidas por Cloudflare podem usar espelhos alternativos ou a Ponte Residencial opcional.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium transition-colors cursor-pointer whitespace-nowrap"
          >
            Concluído
          </button>
        </div>
      </div>
    </div>
  );
};
