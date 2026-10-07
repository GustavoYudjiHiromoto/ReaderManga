import React, { useState, useEffect } from 'react';
import { Layers, Database, Play, Copy, Check, Terminal, ExternalLink, Sparkles } from 'lucide-react';
import { MangaSourceInfo } from '../types/manga.js';
import { MangaApi } from '../services/api.js';

export const ApiDocPage: React.FC = () => {
  const [sources, setSources] = useState<MangaSourceInfo[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [activeEndpoint, setActiveEndpoint] = useState<string>('/api/recommendation-feed');
  const [testResult, setTestResult] = useState<string>('');
  const [loadingTest, setLoadingTest] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadSources();
    runLiveTest('/api/recommendation-feed');
  }, []);

  const loadSources = async () => {
    try {
      const data = await MangaApi.getSources();
      setSources(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSources(false);
    }
  };

  const ENDPOINTS = [
    {
      method: 'GET',
      path: '/api/recommendation-feed',
      title: 'Feed para Sistema de Recomendação',
      description: 'Estrutura otimizada e normalizada com metadados para motores de recomendação externos consumirem de forma desacoplada.'
    },
    {
      method: 'GET',
      path: '/api/sources',
      title: 'Provedores de Mangá Conectados',
      description: 'Retorna a lista de fontes suportadas, estado de conectividade e recursos habilitados.'
    },
    {
      method: 'GET',
      path: '/api/manga/featured',
      title: 'Mangás em Destaque',
      description: 'Retorna títulos populares agregados entre provedores para telas de descoberta.'
    },
    {
      method: 'GET',
      path: '/api/search?q=frieren&limit=10',
      title: 'Pesquisa Multiprovedor',
      description: 'Pesquisa com busca federada entre Mock Catalog, MangaDex ou fontes registradas.'
    },
    {
      method: 'GET',
      path: '/api/manga/mr_mock_frieren-journey',
      title: 'Detalhes da Obra por ID Interno',
      description: 'Consulta um mangá pelo identificador interno desacoplado do MangaReader.'
    },
    {
      method: 'GET',
      path: '/api/manga/mr_mock_frieren-journey/chapters',
      title: 'Listagem de Capítulos',
      description: 'Retorna capítulos ordenados de um mangá com metadados de paginação e idioma.'
    },
    {
      method: 'GET',
      path: '/api/chapters/ch_mock_frieren-journey_frieren-ch-01/pages',
      title: 'Páginas de Leitura',
      description: 'Obtém as páginas e URLs de imagem resolvidas diretamente pelo provedor da obra.'
    }
  ];

  const runLiveTest = async (endpoint: string) => {
    setActiveEndpoint(endpoint);
    setLoadingTest(true);
    try {
      const res = await fetch(endpoint);
      const json = await res.json();
      setTestResult(JSON.stringify(json, null, 2));
    } catch (err) {
      setTestResult(`Erro ao executar requisição: ${(err as Error).message}`);
    } finally {
      setLoadingTest(false);
    }
  };

  const copyResult = () => {
    navigator.clipboard?.writeText(testResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-24">
      {/* Header */}
      <div className="border-b border-zinc-800/80 bg-zinc-900/40 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <Database className="h-4 w-4" />
            <span>MangaReader Core Architecture</span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-white mb-3">
            Camada de API & Múltiplas Fontes
          </h1>
          <p className="text-sm text-zinc-400 max-w-3xl leading-relaxed">
            O MangaReader foi concebido com total separação entre backend e frontend, expondo uma API REST
            independente preparada para consumo por aplicações externas, incluindo o futuro{' '}
            <strong className="text-zinc-200">Sistema de Recomendação de Mangás</strong>.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-10 space-y-12">
        
        {/* Section 1: Fontes Registradas */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Layers className="h-5 w-5 text-rose-400" />
            <h2 className="text-lg font-bold text-zinc-100">Fontes Ativas e Normalização</h2>
          </div>
          <p className="text-xs text-zinc-400 mb-6 max-w-2xl">
            Cada fonte implementa o contrato <code className="text-rose-400">IMangaSource</code>. Identificadores externos são convertidos
            em identificadores canônicos internos (<code className="text-zinc-300">mr_&lt;source&gt;_&lt;id&gt;</code>) para desacoplar totalmente o sistema.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sources.map((src) => (
              <div
                key={src.id}
                className="p-5 rounded-xl bg-zinc-900/70 border border-zinc-800 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm text-zinc-100">{src.name}</h3>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                      ID: {src.id}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mb-4 leading-relaxed">{src.description}</p>
                  
                  <div className="flex flex-wrap gap-2 text-[11px] text-zinc-400">
                    <span className="text-zinc-500">Recursos:</span>
                    <span>Busca</span>
                    <span aria-hidden="true" className="text-zinc-700">·</span>
                    <span>Capítulos</span>
                    <span aria-hidden="true" className="text-zinc-700">·</span>
                    <span>Páginas de Leitura</span>
                    <span aria-hidden="true" className="text-zinc-700">·</span>
                    <span>{src.type === 'live_api' ? 'API Externa ao Vivo' : 'Mock (Demonstração / Testes)'}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-800 flex items-center justify-between text-[11px]">
                  {src.type === 'live_api' ? (
                    <span className="text-emerald-400 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      API Externa Online & Operacional
                    </span>
                  ) : (
                    <span className="text-amber-400 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      Mock em Memória (Offline Ready)
                    </span>
                  )}
                  {src.websiteUrl && (
                    <a
                      href={src.websiteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-zinc-400 hover:text-rose-400 flex items-center gap-1"
                    >
                      <span>Documentação</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 2: Interactive API Console */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-rose-400" />
              <h2 className="text-lg font-bold text-zinc-100">Console Interativo de Endpoints</h2>
            </div>
            <span className="text-xs text-zinc-400">Execução em tempo real no servidor Express</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Endpoints List */}
            <div className="lg:col-span-5 space-y-2">
              {ENDPOINTS.map((ep) => (
                <div
                  key={ep.path}
                  onClick={() => runLiveTest(ep.path)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    activeEndpoint === ep.path
                      ? 'bg-rose-950/20 border-rose-600/80'
                      : 'bg-zinc-900/60 hover:bg-zinc-900 border-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] font-mono font-bold text-rose-400">
                      {ep.method}
                    </span>
                    <span className="font-mono text-xs text-zinc-200 line-clamp-1">{ep.path}</span>
                  </div>
                  <h4 className="font-medium text-xs text-zinc-300">{ep.title}</h4>
                  <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">{ep.description}</p>
                </div>
              ))}
            </div>

            {/* Live Response Viewer */}
            <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl flex flex-col h-[520px]">
              <div className="flex items-center justify-between px-4 py-3 bg-zinc-950 border-b border-zinc-800 text-xs">
                <div className="flex items-center gap-2 font-mono text-zinc-400">
                  <span className="text-emerald-400">GET</span>
                  <span className="text-zinc-200">{activeEndpoint}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => runLiveTest(activeEndpoint)}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    <Play className="h-3 w-3" />
                    <span>Executar</span>
                  </button>
                  <button
                    onClick={copyResult}
                    className="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                    title="Copiar JSON"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* Response Code Output */}
              <div className="flex-1 overflow-auto p-4 bg-zinc-950/70 font-mono text-xs text-zinc-300">
                {loadingTest ? (
                  <div className="h-full flex items-center justify-center text-zinc-500">
                    <span>Consultando backend...</span>
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap">{testResult}</pre>
                )}
              </div>
            </div>

          </div>
        </section>

      </div>
    </div>
  );
};
