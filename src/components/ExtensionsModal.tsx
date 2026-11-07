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
  ShieldCheck, 
  RotateCcw,
  Sparkles,
  Info,
  CheckCircle2,
  XCircle,
  HelpCircle
} from 'lucide-react';
import { MangaSourceInfo, SourcePingResult } from '../types/manga.js';
import { ExtensionService, FALLBACK_SOURCES_META } from '../services/extensionService.js';
import { MangaApi } from '../services/api.js';

interface ExtensionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSourceSettingsChanged?: () => void;
}

export const ExtensionsModal: React.FC<ExtensionsModalProps> = ({
  isOpen,
  onClose,
  onSourceSettingsChanged
}) => {
  const [sources, setSources] = useState<MangaSourceInfo[]>(() => [...FALLBACK_SOURCES_META]);
  const [loading, setLoading] = useState(false);
  const [pingingId, setPingingId] = useState<string | null>(null);
  const [pingingAll, setPingingAll] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [configs, setConfigs] = useState(() => ExtensionService.getConfigs());
  const [pingResults, setPingResults] = useState<Record<string, SourcePingResult>>(() => ExtensionService.getAllPingResults());

  // Listen to service updates
  useEffect(() => {
    const unsub = ExtensionService.subscribe(() => {
      setConfigs(ExtensionService.getConfigs());
      setPingResults(ExtensionService.getAllPingResults());
    });
    return unsub;
  }, []);

  // Fetch sources list from API and merge
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    async function init() {
      try {
        const data = await ExtensionService.getSourcesMeta();
        if (mounted && data.length > 0) {
          setSources(data);
          setConfigs(ExtensionService.getConfigs());
          setPingResults(ExtensionService.getAllPingResults());
        }
      } catch (err) {
        console.warn('Failed to load sources in ExtensionsModal:', err);
      }
    }

    init();
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sortedSources = [...sources].sort((a, b) => {
    const pA = configs[a.id]?.priority ?? 99;
    const pB = configs[b.id]?.priority ?? 99;
    return pA - pB;
  });

  const enabledCount = Object.values(configs).filter(c => c.enabled).length;

  const handleToggle = (sourceId: string) => {
    setErrorNotice(null);
    setSuccessNotice(null);
    const result = ExtensionService.toggleSource(sourceId);
    if (!result.success && result.message) {
      setErrorNotice(result.message);
      setTimeout(() => setErrorNotice(null), 4500);
      return;
    }
    const isNowEnabled = ExtensionService.isSourceEnabled(sourceId);
    setSuccessNotice(`Extensão ${sourceId} ${isNowEnabled ? 'ativada' : 'desativada'} com sucesso.`);
    setTimeout(() => setSuccessNotice(null), 3000);
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
    } catch {
      // Handled in service
    } finally {
      setPingingId(null);
    }
  };

  const handlePingAll = async () => {
    setPingingAll(true);
    try {
      const res = await ExtensionService.pingAllSources();
      setPingResults(res);
    } catch {
      // Handled in service
    } finally {
      setPingingAll(false);
    }
  };

  const handleEnableAll = () => {
    ExtensionService.enableAll();
    setSuccessNotice('Todas as extensões foram ativadas.');
    setTimeout(() => setSuccessNotice(null), 3000);
    onSourceSettingsChanged?.();
  };

  const handleResetDefaults = () => {
    ExtensionService.resetToDefaults();
    setSuccessNotice('Configurações de extensões restauradas para o padrão.');
    setTimeout(() => setSuccessNotice(null), 3000);
    onSourceSettingsChanged?.();
  };

  const getSourceStyle = (sourceId: string) => {
    switch (sourceId) {
      case 'mangadex':
        return {
          color: 'from-orange-500/20 to-amber-500/20 text-orange-400 border-orange-500/30',
          dot: 'bg-orange-500',
          ring: 'focus:ring-orange-500/50'
        };
      case 'comick':
        return {
          color: 'from-purple-500/20 to-indigo-500/20 text-purple-400 border-purple-500/30',
          dot: 'bg-purple-500',
          ring: 'focus:ring-purple-500/50'
        };
      case 'weebcentral':
        return {
          color: 'from-cyan-500/20 to-blue-500/20 text-cyan-400 border-cyan-500/30',
          dot: 'bg-cyan-500',
          ring: 'focus:ring-cyan-500/50'
        };
      case 'mangapill':
        return {
          color: 'from-emerald-500/20 to-teal-500/20 text-emerald-400 border-emerald-500/30',
          dot: 'bg-emerald-500',
          ring: 'focus:ring-emerald-500/50'
        };
      case 'mangafire':
        return {
          color: 'from-amber-600/20 to-orange-600/20 text-orange-400 border-orange-500/30',
          dot: 'bg-orange-500',
          ring: 'focus:ring-orange-500/50'
        };
      case 'mangaball':
        return {
          color: 'from-violet-500/20 to-fuchsia-500/20 text-violet-400 border-violet-500/30',
          dot: 'bg-violet-500',
          ring: 'focus:ring-violet-500/50'
        };
      default:
        return {
          color: 'from-zinc-800 to-zinc-900 text-zinc-300 border-zinc-700',
          dot: 'bg-zinc-400',
          ring: 'focus:ring-zinc-500'
        };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-850 bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <Blocks className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-zinc-100">
                  Gerenciador de Extensões & Repositórios
                </h2>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 border border-rose-500/20 text-rose-300">
                  Multiprovedor
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Ative ou desative fontes para ampliar a cobertura de catálogos e resolver indisponibilidades
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Fechar gerenciador de extensões"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar & Global Stats */}
        <div className="px-5 py-3 border-b border-zinc-850 bg-zinc-900/20 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 font-medium">Status:</span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium ${
              enabledCount === sources.length
                ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-600/30'
                : enabledCount > 0
                ? 'bg-amber-950/40 text-amber-300 border border-amber-600/30'
                : 'bg-rose-950/40 text-rose-300 border border-rose-600/30'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${
                enabledCount === sources.length ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`} />
              <span>{enabledCount} de {sources.length} extensões ativas</span>
            </span>

            <span className="hidden md:inline-block text-zinc-600">|</span>
            <span className="hidden md:inline-block text-zinc-500 text-[11px]">
              Busca federada consultando em paralelo
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePingAll}
              disabled={pingingAll || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-750 transition-colors cursor-pointer disabled:opacity-50 text-xs font-medium"
              title="Testar latência e conectividade com todas as fontes"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-rose-400 ${pingingAll ? 'animate-spin' : ''}`} />
              <span>{pingingAll ? 'Testando...' : 'Testar Conexões'}</span>
            </button>

            {enabledCount < sources.length && (
              <button
                onClick={handleEnableAll}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-emerald-400 hover:text-emerald-300 border border-zinc-750 transition-colors cursor-pointer text-xs font-medium"
                title="Ativar todas as fontes de mangás"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Ativar Todas</span>
              </button>
            )}

            <button
              onClick={handleResetDefaults}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer text-xs"
              title="Restaurar prioridades e estado padrão das extensões"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Padrão</span>
            </button>
          </div>
        </div>

        {/* Notices */}
        {errorNotice && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-rose-950/40 border border-rose-600/40 text-rose-300 text-xs flex items-center gap-2.5 animate-in fade-in">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{errorNotice}</span>
          </div>
        )}

        {successNotice && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-emerald-950/40 border border-emerald-600/40 text-emerald-300 text-xs flex items-center gap-2.5 animate-in fade-in">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{successNotice}</span>
          </div>
        )}

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-rose-400" />
              <span className="text-xs">Carregando catálogo de extensões...</span>
            </div>
          ) : (
            sortedSources.map((source, index) => {
              const isEnabled = configs[source.id]?.enabled ?? true;
              const isPinging = pingingId === source.id || pingingAll;
              const ping = pingResults[source.id];
              const style = getSourceStyle(source.id);

              return (
                <div
                  key={source.id}
                  className={`p-4 rounded-xl border transition-all duration-200 ${
                    isEnabled
                      ? 'bg-zinc-900/60 hover:bg-zinc-900/90 border-zinc-800'
                      : 'bg-zinc-950/50 border-zinc-850/60 opacity-60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Source Left Details */}
                    <div className="flex items-start gap-3">
                      {/* Priority Controls */}
                      <div className="flex flex-col items-center justify-center gap-0.5 pt-0.5">
                        <button
                          onClick={() => handleMovePriority(source.id, 'up')}
                          disabled={index === 0}
                          className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-20 cursor-pointer transition-colors"
                          title="Aumentar prioridade de busca"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-[10px] font-mono font-bold text-zinc-500 px-1">
                          #{index + 1}
                        </span>
                        <button
                          onClick={() => handleMovePriority(source.id, 'down')}
                          disabled={index === sortedSources.length - 1}
                          className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-20 cursor-pointer transition-colors"
                          title="Diminuir prioridade de busca"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Info & Badges */}
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-gradient-to-r border ${style.color}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                            <span>{source.name}</span>
                          </span>

                          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-400">
                            v{source.version}
                          </span>

                          {source.badge && (
                            <span className="px-2 py-0.5 rounded-full bg-zinc-850 text-[10px] font-medium text-zinc-300 border border-zinc-750">
                              {source.badge}
                            </span>
                          )}

                          {source.catalogEstimate && (
                            <span className="text-[11px] text-zinc-500">
                              {source.catalogEstimate}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-zinc-400 leading-relaxed pr-2">
                          {source.description}
                        </p>

                        {/* Supported Features & Languages */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
                          {source.languages && source.languages.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-zinc-850 text-zinc-400 font-mono">
                              {source.languages.join(' • ')}
                            </span>
                          )}
                          {source.supportedFeatures.multipleLanguages && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 font-medium">
                              Multilíngue
                            </span>
                          )}
                          {source.supportedFeatures.webtoons && (
                            <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 font-medium">
                              Webtoons HD
                            </span>
                          )}
                          {source.supportedFeatures.chaptersDeduplication && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-medium">
                              Deduplicação Inteligente
                            </span>
                          )}
                          {source.websiteUrl && (
                            <a
                              href={source.websiteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-300 transition-colors ml-1"
                              title="Visitar repositório oficial da fonte"
                            >
                              <span>Website</span>
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Source Right Controls (Status, Ping, Toggle) */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-850">
                      {/* Latency & Ping result */}
                      <div className="flex items-center gap-2">
                        {isPinging ? (
                          <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                            <Activity className="h-3.5 w-3.5 text-rose-400 animate-spin" />
                            <span className="text-[11px]">Sondando...</span>
                          </span>
                        ) : ping ? (
                          <div className="flex items-center gap-1 text-xs" title={ping.error || `Verificado: ${ping.latencyMs}ms`}>
                            {ping.status === 'online' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/40 text-emerald-300 border border-emerald-600/30 text-[11px] font-medium font-mono">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                <span>{ping.latencyMs}ms</span>
                              </span>
                            ) : ping.status === 'degraded' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-950/40 text-amber-300 border border-amber-600/30 text-[11px] font-medium font-mono">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                                <span>{ping.latencyMs}ms</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-950/40 text-rose-300 border border-rose-600/30 text-[11px] font-medium">
                                <XCircle className="h-3 w-3 text-rose-400" />
                                <span>Falha</span>
                              </span>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => handlePingOne(source.id)}
                            className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors cursor-pointer px-2 py-1 rounded hover:bg-zinc-800"
                            title="Testar tempo de resposta desta fonte"
                          >
                            <Activity className="h-3 w-3" />
                            <span>Ping</span>
                          </button>
                        )}
                      </div>

                      {/* Enable/Disable Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggle(source.id)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:ring-offset-zinc-950 ${
                          isEnabled ? 'bg-rose-500' : 'bg-zinc-800'
                        }`}
                        role="switch"
                        aria-checked={isEnabled}
                        title={isEnabled ? `Desativar fonte ${source.name}` : `Ativar fonte ${source.name}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            isEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Educational Failover & Coverage Tip */}
          <div className="mt-4 p-4 rounded-xl bg-zinc-900/40 border border-zinc-850 flex items-start gap-3 text-xs text-zinc-400">
            <Sparkles className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-zinc-200 block">
                Failover Automático e Cobertura Ampliada
              </span>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Ao manter todas as extensões ativas, o MangaReader busca em paralelo nos repositórios e unifica os resultados sem duplicatas.
                Caso uma fonte sofra instabilidade ou tenha páginas faltando em um capítulo, o leitor realiza o failover automático para outra fonte ativa transparente ao usuário.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-zinc-850 bg-zinc-900/50 flex items-center justify-between text-xs">
          <div className="text-zinc-500 text-[11px]">
            Preferências salvas localmente e sincronizadas com a sua conta.
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-medium transition-colors cursor-pointer"
          >
            Concluído
          </button>
        </div>
      </div>
    </div>
  );
};
