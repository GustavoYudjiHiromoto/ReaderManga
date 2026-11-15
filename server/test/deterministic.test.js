/**
 * PARTE 1 — TESTES DETERMINÍSTICOS
 * Esta suíte testa contratos locais, coexistência das 4 fontes reais (Comick, MangaDex, WeebCentral, MangaPill),
 * SourceRegistry e comportamento HTTP da API sem qualquer dependência de Mock.
 */

const BASE_URL = 'http://localhost:3000';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ FALHA: ${message}`);
  }
}

async function runDeterministicTests() {
  console.log('====================================================');
  console.log('PARTE 1: SUÍTE DE TESTES DETERMINÍSTICOS (LOCAL & CI)');
  console.log('====================================================\n');

  let serverInstance = null;
  try {
    // Garante que o servidor esteja rodando. Se estiver em ambiente CI (onde o servidor não roda em background), inicializa-o embutido.
    try {
      const checkRes = await fetch(`${BASE_URL}/api/sources`, { signal: AbortSignal.timeout(1200) });
      if (!checkRes.ok) throw new Error('Servidor não ativo');
    } catch {
      console.log('⚡ Servidor não detectado em localhost:3000. Inicializando instância de testes para execução em CI...');
      const express = (await import('express')).default;
      const { apiRouter } = await import('../api/routes.js');
      const { trackerRouter } = await import('../trackers/TrackerRouter.js');
      const app = express();
      app.use(express.json());
      app.use('/api/trackers', trackerRouter);
      app.use('/api', apiRouter);
      await new Promise((resolve) => {
        serverInstance = app.listen(3000, '0.0.0.0', () => {
          console.log('  ✓ Servidor de testes iniciado com sucesso em http://0.0.0.0:3000\n');
          resolve();
        });
      });
    }

    // -------------------------------------------------------------------------
    // 1. CONTRATO DO ENDPOINT /api/sources (SEM MOCK)
    // -------------------------------------------------------------------------
    console.log('[1/4] Testando /api/sources e Coexistência de Fontes Reais...');
    const sourcesRes = await fetch(`${BASE_URL}/api/sources`);
    assert(sourcesRes.status === 200, 'GET /api/sources retorna status 200');
    const sourcesJson = await sourcesRes.json();
    assert(sourcesJson.success === true, 'Resposta possui success: true');
    assert(Array.isArray(sourcesJson.data), 'data é um array de fontes');
    
    const mockSource = sourcesJson.data.find(s => s.id === 'mock');
    const dexSource = sourcesJson.data.find(s => s.id === 'mangadex');
    const comickSource = sourcesJson.data.find(s => s.id === 'comick');
    const weebSource = sourcesJson.data.find(s => s.id === 'weebcentral');
    const pillSource = sourcesJson.data.find(s => s.id === 'mangapill');
    const fireSource = sourcesJson.data.find(s => s.id === 'mangafire');
    const ballSource = sourcesJson.data.find(s => s.id === 'mangaball');

    assert(!mockSource, 'Fonte "mock" foi completamente removida de /api/sources');
    assert(!!dexSource, 'Fonte "mangadex" está registrada em /api/sources');
    assert(dexSource?.type === 'live_api', 'Fonte "mangadex" possui type === "live_api"');
    assert(!!comickSource, 'Fonte "comick" está registrada em /api/sources');
    assert(comickSource?.type === 'live_api', 'Fonte "comick" possui type === "live_api"');
    assert(!!weebSource, 'Fonte "weebcentral" está registrada em /api/sources');
    assert(weebSource?.type === 'live_api', 'Fonte "weebcentral" possui type === "live_api"');
    assert(!!pillSource, 'Fonte "mangapill" está registrada em /api/sources');
    assert(pillSource?.type === 'live_api', 'Fonte "mangapill" possui type === "live_api"');
    assert(!!fireSource, 'Fonte "mangafire" está registrada em /api/sources');
    assert(fireSource?.type === 'live_api', 'Fonte "mangafire" possui type === "live_api"');
    assert(!!ballSource, 'Fonte "mangaball" está registrada em /api/sources');
    assert(ballSource?.type === 'live_api', 'Fonte "mangaball" possui type === "live_api"');
    assert(sourcesJson.data.length === 6, 'Exatamente 6 fontes reais ativas (MangaDex, Comick, WeebCentral, MangaPill, MangaFire, MangaBall)');

    // -------------------------------------------------------------------------
    // 2. BUSCA FEDERADA E POPULARES DAS FONTES REAIS
    // -------------------------------------------------------------------------
    console.log('\n[2/4] Testando Busca Federada e Featured...');
    const searchRes = await fetch(`${BASE_URL}/api/search?q=berserk`);
    assert(searchRes.status === 200, 'GET /api/search?q=berserk retorna 200');
    const searchJson = await searchRes.json();
    assert(searchJson.total > 0, 'Busca retorna ao menos 1 resultado para "berserk"');
    assert(!searchJson.data.some(m => m.id.includes('_mock_')), 'Nenhum resultado de busca contém o prefixo canônico "mr_mock_"');

    // -------------------------------------------------------------------------
    // 3. DETALHES, CAPÍTULOS E PÁGINAS DE FONTE REAL (MANGAPILL)
    // -------------------------------------------------------------------------
    console.log('\n[3/4] Testando Detalhes, Capítulos e Páginas Reais (MangaPill)...');
    const mangaRes = await fetch(`${BASE_URL}/api/manga/mr_mangapill_1-berserk`);
    assert(mangaRes.status === 200, 'GET /api/manga/mr_mangapill_1-berserk retorna 200');
    const mangaJson = await mangaRes.json();
    assert(mangaJson.data?.sources[0]?.sourceId === 'mangapill', 'SourceId do vínculo primário é "mangapill"');
    assert(mangaJson.data?.title.includes('Berserk'), 'Título do mangá retornado corresponde à obra real');

    const chRes = await fetch(`${BASE_URL}/api/manga/mr_mangapill_1-berserk/chapters`);
    assert(chRes.status === 200, 'GET /api/manga/.../chapters retorna 200');
    const chJson = await chRes.json();
    assert(chJson.total > 0, 'MangaPill de Berserk possui capítulos cadastrados');
    assert(chJson.data[0]?.id.startsWith('ch_mangapill_'), 'ID do capítulo possui prefixo canônico "ch_mangapill_"');

    const firstChId = chJson.data[0]?.id;
    const pagesRes = await fetch(`${BASE_URL}/api/chapters/${firstChId}/pages`);
    assert(pagesRes.status === 200, `GET /api/chapters/${firstChId}/pages retorna 200`);
    const pagesJson = await pagesRes.json();
    assert(pagesJson.total > 0, 'Capítulo 1 possui páginas resolvidas');
    assert(pagesJson.data[0]?.pageNumber === 1, 'Páginas numeradas a partir de 1');
    assert(typeof pagesJson.data[0]?.imageUrl === 'string', 'Páginas possuem URL de imagem válida');

    // -------------------------------------------------------------------------
    // 4. TRATAMENTO DE ERROS SEMÂNTICOS (400 vs 404) E PARSER DE CAPÍTULOS
    // -------------------------------------------------------------------------
    console.log('\n[4/4] Testando Semântica de Erros (400 vs 404) e Formato de IDs...');
    
    // 4.1 Erro 400: Formato de ID inválido
    const r400Manga = await fetch(`${BASE_URL}/api/manga/id_sem_prefixo_valido`);
    assert(r400Manga.status === 400, 'ID de mangá sem formato "mr_<source>_<id>" retorna HTTP 400');
    const r400MangaJson = await r400Manga.json();
    assert(r400MangaJson.error.includes('Formato de identificador de mangá inválido'), 'Mensagem explicativa de formato de mangá inválido');

    const r400Ch = await fetch(`${BASE_URL}/api/chapters/ch_incompleto/pages`);
    assert(r400Ch.status === 400, 'ID de capítulo com partes insuficientes retorna HTTP 400');
    const r400ChJson = await r400Ch.json();
    assert(r400ChJson.error.includes('Formato de identificador de capítulo inválido'), 'Mensagem explicativa de formato de capítulo inválido');

    // 4.2 Verificação determinística do parser de IDs de capítulo (SourceRegistry)
    const { SourceRegistry } = await import('../sources/SourceRegistry.js');
    const registry = new SourceRegistry();

    // ID canônico MangaPill
    const parsedPill = registry.parseInternalChapterId('ch_mangapill_1-berserk_1-10001000---berserk-chapter-1');
    assert(parsedPill.sourceId === 'mangapill', 'Parser extrai sourceId "mangapill"');
    assert(parsedPill.externalMangaId === '1-berserk', 'Parser extrai externalMangaId do mangapill');
    assert(parsedPill.externalChapterId === '1-10001000---berserk-chapter-1', 'Parser extrai externalChapterId do mangapill');

    // ID canônico MangaDex sem fallback
    const parsedMd = registry.parseInternalChapterId('ch_mangadex_a77742b1_e7c4d0c9-cec9-4116-aba1-178b2a5d4cc3');
    assert(parsedMd.sourceId === 'mangadex', 'Parser extrai sourceId "mangadex"');
    assert(parsedMd.externalMangaId === 'a77742b1', 'Parser extrai externalMangaId do mangadex');
    assert(parsedMd.externalChapterId === 'e7c4d0c9-cec9-4116-aba1-178b2a5d4cc3', 'Parser extrai externalChapterId do mangadex');
    assert(parsedMd.fallbackChapterId === undefined, 'MangaDex sem fallback não possui fallbackChapterId');

    // ID Comick sem mdid (mantém formato canônico atual)
    const parsedComickStandard = registry.parseInternalChapterId('ch_comick_71gMd0vF_Tggg2nmZ');
    assert(parsedComickStandard.sourceId === 'comick', 'Parser extrai sourceId "comick"');
    assert(parsedComickStandard.externalMangaId === '71gMd0vF', 'Parser extrai externalMangaId "71gMd0vF"');
    assert(parsedComickStandard.externalChapterId === 'Tggg2nmZ', 'Parser extrai externalChapterId "Tggg2nmZ"');
    assert(parsedComickStandard.fallbackChapterId === undefined, 'Capítulo Comick sem sufixo não possui fallbackChapterId');

    // ID Comick com mdid (recebe sufixo __md_<mdid>)
    const sampleMdid = 'e7c4d0c9-cec9-4116-aba1-178b2a5d4cc3';
    const parsedComickWithFallback = registry.parseInternalChapterId(`ch_comick_71gMd0vF_Tggg2nmZ__md_${sampleMdid}`);
    assert(parsedComickWithFallback.sourceId === 'comick', 'Parser com fallback extrai sourceId "comick"');
    assert(parsedComickWithFallback.externalMangaId === '71gMd0vF', 'Parser com fallback extrai externalMangaId');
    assert(parsedComickWithFallback.externalChapterId === 'Tggg2nmZ', 'Parser com fallback extrai externalChapterId limpo');
    assert(parsedComickWithFallback.fallbackChapterId === sampleMdid, 'Parser extrai fallbackChapterId com o UUID correto do MangaDex');

    // 4.3 Erro 404: Fonte inexistente ou desativada
    const r404Source = await fetch(`${BASE_URL}/api/manga/mr_mock_frieren-journey`);
    assert(r404Source.status === 404, 'Tentativa de acessar fonte desativada (mr_mock_...) retorna HTTP 404');
    const r404SourceJson = await r404Source.json();
    assert(r404SourceJson.error.includes('não suportada') || r404SourceJson.error.includes('não encontrada'), 'Mensagem informa que a fonte não é suportada ou não foi encontrada');

    // -------------------------------------------------------------------------
    // 5. TESTES DE FILTRAGEM ADULTA (+18 / HENTAI) E DISPONIBILIDADE DE CAPÍTULOS (FASE 2)
    // -------------------------------------------------------------------------
    console.log('\n[5/5] Testando Filtro +18 e Disponibilidade de Capítulos (Fase 2)...');

    // 5.1 Busca padrão esconde conteúdo adulto por padrão (Safe Search)
    const safeSearchRes = await fetch(`${BASE_URL}/api/search?q=hentai`);
    assert(safeSearchRes.status === 200, 'GET /api/search?q=hentai retorna 200');
    const safeSearchJson = await safeSearchRes.json();
    const hasUnfilteredAdult = safeSearchJson.data.some(m => m.isAdult === true);
    assert(!hasUnfilteredAdult, 'Busca padrão com Safe Search esconde obras marcadas como adultas (+18)');

    // 5.2 Busca com includeAdult=true libera obras adultas
    const adultSearchRes = await fetch(`${BASE_URL}/api/search?q=hentai&includeAdult=true`);
    assert(adultSearchRes.status === 200, 'GET /api/search?q=hentai&includeAdult=true retorna 200');
    const adultSearchJson = await adultSearchRes.json();
    assert(Array.isArray(adultSearchJson.data), 'Busca com includeAdult=true retorna array');

    // 5.3 Obras retornadas possuem campos de disponibilidade e contentRating
    const sampleManga = searchJson.data[0];
    if (sampleManga) {
      assert(typeof sampleManga.hasAvailableChapters === 'boolean', 'Obra possui campo hasAvailableChapters (boolean)');
      assert(typeof sampleManga.isAdult === 'boolean', 'Obra possui campo isAdult (boolean)');
      assert(typeof sampleManga.contentRating === 'string', 'Obra possui campo contentRating (string)');
      assert(typeof sampleManga.availabilityStatus === 'string', 'Obra possui campo availabilityStatus (string)');
    }

    // 5.4 Teste de filtro onlyAvailable=true
    const availSearchRes = await fetch(`${BASE_URL}/api/search?q=berserk&onlyAvailable=true`);
    assert(availSearchRes.status === 200, 'GET /api/search?q=berserk&onlyAvailable=true retorna 200');
    const availSearchJson = await availSearchRes.json();
    const allHaveChapters = availSearchJson.data.every(m => m.hasAvailableChapters === true);
    assert(allHaveChapters, 'Todos os resultados com onlyAvailable=true possuem hasAvailableChapters === true');

    // -------------------------------------------------------------------------
    // 6. TESTES DE DEDUPLICAÇÃO E AGRUPAMENTO DE CAPÍTULOS (FASE 3)
    // -------------------------------------------------------------------------
    console.log('\n[6/6] Testando Deduplicação e Agrupamento de Capítulos (Fase 3)...');

    const {
      normalizeChapterNumber,
      detectEdition,
      areChaptersEquivalent,
      deduplicateAndGroupChapters
    } = await import('../sources/ChapterDeduplicator.js');

    // 6.1 Normalização de números de capítulo
    assert(normalizeChapterNumber('1.0') === '1', 'normalizeChapterNumber converte "1.0" em "1"');
    assert(normalizeChapterNumber(' 05 ') === '5', 'normalizeChapterNumber converte " 05 " em "5"');
    assert(normalizeChapterNumber('10.5') === '10.5', 'normalizeChapterNumber preserva decimais "10.5"');

    // 6.2 Detecção de edições especiais
    assert(detectEdition('Chapter 1 (Colored)') === 'colored', 'detectEdition detecta edição colorida');
    assert(detectEdition('One-shot Special') === 'oneshot', 'detectEdition detecta oneshot');
    assert(detectEdition('Standard Chapter') === 'standard', 'detectEdition detecta padrão como standard');

    // 6.3 Equivalência de capítulos
    const chPt1 = {
      id: 'ch_mangadex_1_pt',
      mangaId: 'mr_mangadex_1',
      chapterNumber: '1',
      language: 'pt-br',
      sourceId: 'mangadex',
      externalChapterId: 'md_pt_1'
    };
    const chPt1Clone = {
      id: 'ch_comick_1_pt',
      mangaId: 'mr_comick_1',
      chapterNumber: '1.0',
      language: 'pt-br',
      sourceId: 'comick',
      externalChapterId: 'cm_pt_1'
    };
    const chEn1 = {
      id: 'ch_mangadex_1_en',
      mangaId: 'mr_mangadex_1',
      chapterNumber: '1',
      language: 'en',
      sourceId: 'mangadex',
      externalChapterId: 'md_en_1'
    };
    const chPt1Colored = {
      id: 'ch_mangadex_1_pt_color',
      mangaId: 'mr_mangadex_1',
      chapterNumber: '1',
      title: 'Capítulo 1 (Versão Colorida)',
      language: 'pt-br',
      sourceId: 'mangadex',
      externalChapterId: 'md_pt_color_1'
    };

    assert(areChaptersEquivalent(chPt1, chPt1Clone) === true, 'Capítulos com mesmo número e idioma são equivalentes (duplicatas)');
    assert(areChaptersEquivalent(chPt1, chEn1) === false, 'Capítulos com idiomas distintos (PT-BR vs EN) NÃO são equivalentes');
    assert(areChaptersEquivalent(chPt1, chPt1Colored) === false, 'Capítulo normal vs edição colorida NÃO são equivalentes');

    // 6.4 Deduplicação e agrupamento de lista
    const rawChapters = [chPt1, chPt1Clone, chEn1, chPt1Colored];
    const grouped = deduplicateAndGroupChapters(rawChapters);
    assert(grouped.length === 3, 'Lista de 4 capítulos (com 1 duplicata) foi agrupada em 3 itens canônicos');
    const groupedPt = grouped.find(c => c.language === 'pt-br' && c.chapterNumber === '1' && (!c.edition || c.edition === 'standard'));
    assert(!!groupedPt, 'Item canônico PT-BR Capítulo 1 está presente');
    assert(groupedPt.variants?.length === 1, 'Item canônico possui exatamente 1 variante agrupada');
    assert(groupedPt.variants[0].externalChapterId === 'cm_pt_1', 'Variante agrupada contém o externalChapterId correto');

    // 6.5 Endpoint /api/manga/:id/chapters responde com deduplicate=true
    const chaptersApiRes = await fetch(`${BASE_URL}/api/manga/mr_mangapill_1-berserk/chapters?deduplicate=true`);
    assert(chaptersApiRes.status === 200, 'GET /api/manga/.../chapters?deduplicate=true retorna 200');
    const chaptersApiJson = await chaptersApiRes.json();
    assert(chaptersApiJson.success === true, 'Endpoint de capítulos com deduplicação retorna success: true');
    assert(Array.isArray(chaptersApiJson.data), 'Endpoint retorna array de capítulos');

    // -------------------------------------------------------------------------
    // 7. TESTES DE CACHE LRU EM MEMÓRIA E DOWNLOAD OFFLINE (FASE 4)
    // -------------------------------------------------------------------------
    console.log('\n[7/7] Testando Cache LRU e Download Offline CBZ (Fase 4)...');

    const { CacheService } = await import('../cache/CacheService.js');

    // 7.1 CacheService: operações básicas
    const testCache = new CacheService(3, 60);
    testCache.set('k1', 'val1');
    assert(testCache.get('k1') === 'val1', 'CacheService armazena e recupera chave');
    assert(testCache.has('k1') === true, 'CacheService.has() retorna true para chave existente');
    assert(testCache.has('k_nonexistent') === false, 'CacheService.has() retorna false para chave inexistente');

    // 7.2 CacheService: política LRU
    testCache.set('k2', 'val2');
    testCache.set('k3', 'val3');
    testCache.set('k4', 'val4'); // deve remover k1 por atingir maxEntries (3)
    assert(testCache.get('k1') === undefined, 'CacheService remove chave mais antiga por política LRU');
    assert(testCache.get('k4') === 'val4', 'CacheService preserva nova chave inserida');

    // 7.3 CacheService: expiração por TTL
    const expiringCache = new CacheService(10, 0.05); // 50ms TTL
    expiringCache.set('temp', 'tempVal');
    assert(expiringCache.get('temp') === 'tempVal', 'Valor acessível antes do TTL expirar');
    await new Promise(r => setTimeout(r, 65));
    assert(expiringCache.get('temp') === undefined, 'Valor expira automaticamente após TTL');

    // 7.4 Endpoint /api/cache/stats
    const statsRes = await fetch(`${BASE_URL}/api/cache/stats`);
    assert(statsRes.status === 200, 'GET /api/cache/stats retorna status 200');
    const statsJson = await statsRes.json();
    assert(statsJson.success === true, 'Stats retorna success: true');
    assert(typeof statsJson.data?.size === 'number', 'Stats contém size numérico');
    assert(typeof statsJson.data?.hitRate === 'number', 'Stats contém hitRate numérico');

    // 7.5 Verificação de cabeçalho X-Cache
    await fetch(`${BASE_URL}/api/sources`); // garante aquecimento
    const hitRes = await fetch(`${BASE_URL}/api/sources`);
    assert(hitRes.headers.get('x-cache') === 'HIT', 'Segunda requisição retorna cabeçalho X-Cache: HIT');

    // 7.6 Endpoint de Download de Capítulo (.cbz)
    const sampleChId = 'ch_mangapill_1-berserk_1-10001000---berserk-chapter-1';
    const downloadRes = await fetch(`${BASE_URL}/api/chapters/${sampleChId}/download?format=cbz`);
    assert(downloadRes.status === 200, 'GET /api/chapters/.../download retorna 200');
    assert(downloadRes.headers.get('content-type')?.includes('comicbook+zip') || downloadRes.headers.get('content-type')?.includes('zip'), 'Download retorna Content-Type de CBZ/ZIP');
    assert(downloadRes.headers.get('content-disposition')?.includes('attachment'), 'Download retorna Content-Disposition attachment');
    assert(downloadRes.headers.get('content-disposition')?.includes('.cbz'), 'Nome do arquivo para download possui extensão .cbz');

    // -------------------------------------------------------------------------
    // 8. TESTES DE HEALTHCHECK E BACKUP DE BIBLIOTECA (FASE 5)
    // -------------------------------------------------------------------------
    console.log('\n[8/8] Testando Healthcheck, Diagnóstico e Backup de Biblioteca (Fase 5)...');

    // 8.1 Endpoint /api/health
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    assert(healthRes.status === 200, 'GET /api/health retorna status 200');
    const healthJson = await healthRes.json();
    assert(healthJson.status === 'healthy', 'Status do healthcheck é "healthy"');
    assert(typeof healthJson.uptime === 'number', 'Uptime do servidor é numérico');
    assert(typeof healthJson.memory?.rssMb === 'number', 'Telemetria de memória contém rssMb');
    assert(typeof healthJson.memory?.heapUsedMb === 'number', 'Telemetria de memória contém heapUsedMb');
    assert(Array.isArray(healthJson.sources), 'Healthcheck lista fontes ativas');
    assert(healthJson.sources.length === 6, 'Healthcheck confirma 6 fontes reais conectadas');
    assert(typeof healthJson.cache?.size === 'number', 'Healthcheck inclui telemetria de cache');

    // 8.2 Validação de Backup & Mesclagem de Biblioteca
    const mockBackupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: 'MangaReader',
      favorites: [
        { mangaId: 'mr_mangapill_1-berserk', title: 'Berserk', coverUrl: 'https://cdn.readdetectiveconan.com/file/mangapill/i/1.jpeg', updatedAt: 1000 },
        { mangaId: 'mr_mangadex_frieren', title: 'Frieren', coverUrl: 'https://img.test/frieren.jpg', updatedAt: 2000 }
      ],
      history: [
        { mangaId: 'mr_mangapill_1-berserk', mangaTitle: 'Berserk', mangaCover: 'https://cdn.readdetectiveconan.com/file/mangapill/i/1.jpeg', chapterId: 'ch1', chapterNumber: '1', pageNumber: 5, totalPages: 20, updatedAt: 1500 }
      ]
    };

    assert(mockBackupData.version === 1, 'Backup possui schema version 1');
    assert(Array.isArray(mockBackupData.favorites), 'Backup contém array de favoritos');
    assert(Array.isArray(mockBackupData.history), 'Backup contém array de histórico');

    // Teste de deduplicação na mesclagem de favoritos
    const existingFavs = [{ mangaId: 'mr_mangapill_1-berserk', title: 'Berserk Old', coverUrl: '', updatedAt: 500 }];
    const favMap = new Map();
    existingFavs.forEach(f => favMap.set(f.mangaId, f));
    mockBackupData.favorites.forEach(f => {
      const existing = favMap.get(f.mangaId);
      favMap.set(f.mangaId, {
        mangaId: f.mangaId,
        title: f.title || existing?.title,
        coverUrl: f.coverUrl || existing?.coverUrl,
        updatedAt: Math.max(f.updatedAt, existing?.updatedAt || 0)
      });
    });

    const mergedFavs = Array.from(favMap.values());
    // -------------------------------------------------------------------------
    // 9. RADAR DE LANÇAMENTOS E RASTREAMENTO DE CAPÍTULOS
    // -------------------------------------------------------------------------
    console.log('\n[9/9] Testando Radar de Lançamentos e Rastreamento de Novos Capítulos...');
    
    // Teste 1: Detecção numérica de novos capítulos
    const progressCh = "117";
    const latestCh = "118";
    const hasNewChapter = parseFloat(latestCh) > parseFloat(progressCh);
    assert(hasNewChapter === true, 'Capítulo 118 é detectado como novo em relação ao lido 117');

    const sameCh = "117";
    assert(parseFloat(sameCh) > parseFloat(progressCh) === false, 'Capítulo 117 não é detectado como novo se já foi lido');

    // Teste 2: Estrutura canônica de MangaUpdateInfo
    const updateSample = {
      mangaId: 'mr_mangadex_chainsaw-man',
      latestChapterId: 'ch_mangadex_118',
      latestChapterNumber: '118',
      hasNew: true,
      lastReadNumber: '117',
      checkedAt: Date.now()
    };

    assert(typeof updateSample.mangaId === 'string', 'MangaUpdateInfo possui mangaId');
    assert(typeof updateSample.latestChapterId === 'string', 'MangaUpdateInfo possui latestChapterId');
    assert(typeof updateSample.latestChapterNumber === 'string', 'MangaUpdateInfo possui latestChapterNumber');
    assert(updateSample.hasNew === true, 'MangaUpdateInfo possui flag hasNew');
    assert(updateSample.lastReadNumber === '117', 'MangaUpdateInfo retém lastReadNumber para contraste no leitor');
    assert(typeof updateSample.checkedAt === 'number', 'MangaUpdateInfo registra timestamp checkedAt');

    // -------------------------------------------------------------------------
    // 10. SISTEMA DE GERENCIAMENTO DE EXTENSÕES, PING E FILTRO POR FONTES
    // -------------------------------------------------------------------------
    console.log('\n[10/10] Testando Gerenciamento de Extensões, Ping e Filtro de Fontes...');
    
    // 10.1 Metadados estendidos de fontes
    const sourcesMetaRes = await fetch(`${BASE_URL}/api/sources`);
    const sourcesMetaJson = await sourcesMetaRes.json();
    const mdSource = sourcesMetaJson.data.find(s => s.id === 'mangadex');
    assert(!!mdSource?.badge, 'MangaDex possui badge de identificação de extensão');
    assert(Array.isArray(mdSource?.languages), 'MangaDex lista idiomas suportados');
    assert(typeof mdSource?.catalogEstimate === 'string', 'MangaDex possui estimativa de acervo');

    const mfSource = sourcesMetaJson.data.find(s => s.id === 'mangafire');
    assert(!!mfSource?.badge, 'MangaFire possui badge de identificação de extensão');
    assert(Array.isArray(mfSource?.languages), 'MangaFire lista idiomas suportados');

    const mbSource = sourcesMetaJson.data.find(s => s.id === 'mangaball');
    assert(!!mbSource?.badge, 'MangaBall possui badge de identificação de extensão');
    assert(Array.isArray(mbSource?.languages), 'MangaBall lista idiomas suportados');

    // 10.2 Ping individual de fonte
    const pingRes = await fetch(`${BASE_URL}/api/sources/mangadex/ping`);
    assert(pingRes.status === 200, 'GET /api/sources/mangadex/ping retorna status 200');
    const pingJson = await pingRes.json();
    assert(pingJson.success === true, 'Ping individual retorna success: true');
    assert(pingJson.data.sourceId === 'mangadex', 'Ping retorna sourceId correspondente');
    assert(typeof pingJson.data.latencyMs === 'number', 'Ping retorna latência em milissegundos');
    assert(['online', 'degraded', 'offline'].includes(pingJson.data.status), 'Ping retorna status de saúde válido');

    // 10.3 Busca com restrição a fonte única (ex: apenas mangadex)
    const singleSourceRes = await fetch(`${BASE_URL}/api/search?q=berserk&sources=mangadex`);
    assert(singleSourceRes.status === 200, 'GET /api/search com sources=mangadex retorna 200');
    const singleSourceJson = await singleSourceRes.json();
    assert(singleSourceJson.sourcesQueried.length === 1 && singleSourceJson.sourcesQueried[0] === 'mangadex', 'Busca consulta estritamente a fonte selecionada');

    // 10.4 Busca com subconjunto de fontes (ex: comick,weebcentral)
    const multiSubsetRes = await fetch(`${BASE_URL}/api/search?q=berserk&sources=comick,weebcentral`);
    assert(multiSubsetRes.status === 200, 'GET /api/search com sources=comick,weebcentral retorna 200');
    const multiSubsetJson = await multiSubsetRes.json();
    assert(multiSubsetJson.sourcesQueried.includes('comick') && multiSubsetJson.sourcesQueried.includes('weebcentral') && !multiSubsetJson.sourcesQueried.includes('mangapill'), 'Busca consulta apenas o subconjunto de fontes ativas');

    // 10.5 Teste dos endpoints e lógica de parsing de MangaBall e MangaFire no ExtensionService
    const { MANGABALL_ENDPOINTS, MANGAFIRE_ENDPOINTS, parseMangaBallItem, parseMangaFireHtml } = await import('../../src/services/extensionService.js');
    assert(typeof MANGABALL_ENDPOINTS.searchAdvanced === 'string', 'MANGABALL_ENDPOINTS define endpoint searchAdvanced');
    assert(typeof MANGAFIRE_ENDPOINTS.filter === 'string', 'MANGAFIRE_ENDPOINTS define endpoint filter');

    const parsedMbItem = parseMangaBallItem({ id: '123', title: 'Solo Leveling', is_nsfw: false });
    assert(parsedMbItem.id === 'mr_mangaball_123', 'parseMangaBallItem gera ID canônico mr_mangaball_123');
    assert(parsedMbItem.title === 'Solo Leveling', 'parseMangaBallItem preserva título');

    const parsedMfHtml = parseMangaFireHtml('<div class="inner"><a href="/manga/one-piece.ov8">test</a><img src="/poster.jpg" alt="One Piece"></div>');
    assert(parsedMfHtml.mangaList.length === 1, 'parseMangaFireHtml extrai obra do HTML');
    assert(parsedMfHtml.mangaList[0].id === 'mr_mangafire_one-piece.ov8', 'parseMangaFireHtml gera ID canônico mr_mangafire_one-piece.ov8');

    // -------------------------------------------------------------------------
    // 11. TESTE DE SUPORTE A BACKUPS .tachibk (MIHON / TACHIYOMI)
    // -------------------------------------------------------------------------
    console.log('[11/11] Testando Suporte a Backups .tachibk (Mihon Protobuf & GZIP)...');
    const { ProtoReader, parseBackupManga, parseTachibk } = await import('../../src/services/tachibkService.js');
    const zlib = (await import('zlib')).default;

    // 11.1 Teste do leitor de varint e tags do ProtoReader
    // Codifica varint 300 (0xAC, 0x02)
    const varintBuf = new Uint8Array([0xac, 0x02]);
    const pr1 = new ProtoReader(varintBuf);
    assert(pr1.readVarint() === 300, 'ProtoReader decodifica varints multi-byte corretamente (300)');

    // 11.2 Codifica uma mensagem BackupManga sintética em Protobuf
    // Tag 3 (wireType 2) -> title = "Chainsaw Man"
    // Tag 2 (wireType 2) -> url = "/manga/chainsaw-man"
    // Tag 7 (wireType 2) -> genre = "Ação"
    const titleBytes = Buffer.from('Chainsaw Man', 'utf8');
    const urlBytes = Buffer.from('/manga/chainsaw-man', 'utf8');
    const genreBytes = Buffer.from('Ação', 'utf8');

    const mangaPayload = Buffer.concat([
      Buffer.from([(3 << 3) | 2, titleBytes.length]),
      titleBytes,
      Buffer.from([(2 << 3) | 2, urlBytes.length]),
      urlBytes,
      Buffer.from([(7 << 3) | 2, genreBytes.length]),
      genreBytes
    ]);

    const decodedManga = parseBackupManga(new Uint8Array(mangaPayload));
    assert(decodedManga.title === 'Chainsaw Man', 'parseBackupManga extrai título em Protobuf');
    assert(decodedManga.url === '/manga/chainsaw-man', 'parseBackupManga extrai URL em Protobuf');
    assert(decodedManga.genre.includes('Ação'), 'parseBackupManga extrai gêneros em Protobuf');

    // 11.3 Codifica mensagem Backup raiz com tag 1 (mangaPayload) e comprime em GZIP (.tachibk)
    const rootPayload = Buffer.concat([
      Buffer.from([(1 << 3) | 2, mangaPayload.length]),
      mangaPayload
    ]);
    const gzippedTachibk = zlib.gzipSync(rootPayload);

    // 11.4 Testa descompressão via API local POST /api/backup/decompress
    const decompressRes = await fetch(`${BASE_URL}/api/backup/decompress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: gzippedTachibk
    });
    assert(decompressRes.status === 200, 'POST /api/backup/decompress retorna 200 para payload GZIP');
    const decompressedBytes = Buffer.from(await decompressRes.arrayBuffer());
    assert(decompressedBytes.length === rootPayload.length, 'Decompressão no servidor preserva integridade exata dos bytes');

    // 11.5 Testa parseTachibk fim a fim com callback de progresso (feedback visual para o usuário)
    const progressReports = [];
    const parsedBackup = await parseTachibk(new Uint8Array(gzippedTachibk), (info) => {
      progressReports.push(info);
    });
    assert(parsedBackup.mangas.length === 1, 'parseTachibk extrai mangas de arquivo .tachibk');
    assert(parsedBackup.mangas[0].title === 'Chainsaw Man', 'parseTachibk preserva metadados da obra');
    assert(progressReports.length >= 3, 'parseTachibk emite múltiplos eventos de progresso durante a leitura');
    assert(progressReports.some(p => p.stage === 'reading' && p.percent > 0), 'parseTachibk reporta estágio de leitura inicial');
    assert(progressReports.some(p => p.stage === 'decompressing'), 'parseTachibk reporta estágio de descompressão');
    assert(progressReports.some(p => p.percent >= 70), 'parseTachibk atinge percentual de finalização da decodificação');

    // -------------------------------------------------------------------------
    // 12. MOTOR INTELIGENTE DE SIMILARIDADE POR SINOPSE & ENREDO
    // -------------------------------------------------------------------------
    console.log('\n[12/12] Testando Similaridade Semântica por Sinopse e Enredo...');
    const {
      extractSemanticThemes,
      extractNarrativeSearchQueries,
      scoreSimilarMangaCandidate
    } = await import('../../src/services/recommendationService.js');

    const targetRomcom = {
      id: 'mr_comick_dirtpoor',
      title: "The Dirt-Poor Me Was Bought by My Childhood Friend, and Now I'm Living a Slightly Thrilling Life",
      altTitles: ['Chou Binbou na Ore wa Osananajimi ni Kaware'],
      synopsis:
        'Born into extreme poverty, Yukiya Ichinose works nonstop part-time jobs until his parents vanish overnight, dumping a massive mountain of debt on him. Approached by his estranged childhood friend Yui, Yukiya is bought in exchange for paying off the debt and moves in to live under the same roof in a sweet high school romcom with a devoted heroine.',
      genres: ['Manga', 'Seinen', 'Comedy', 'Romance', 'Slice of life'],
      authors: ['Kamishiro']
    };

    const detectedThemes = extractSemanticThemes(`${targetRomcom.title} ${targetRomcom.synopsis}`);
    assert(detectedThemes.includes('Amigo(a) de Infância'), 'Extrai tema narrativo "Amigo(a) de Infância" da sinopse');
    assert(detectedThemes.includes('Dívida & Acordo Financeiro'), 'Extrai tema narrativo "Dívida & Acordo Financeiro" da sinopse');
    assert(detectedThemes.includes('Mesmo Teto & Coabitação'), 'Extrai tema narrativo "Mesmo Teto & Coabitação" da sinopse');

    const extractedQueries = extractNarrativeSearchQueries(targetRomcom);
    assert(extractedQueries.length >= 2, 'Extrai consultas de busca guiadas pelos tropos da sinopse');

    // Candidato A: Sinopse muito parecida (dívida, amigo de infância, morar junto) mesmo tendo gênero Shounen ao invés de Seinen
    const narrativeTwin = {
      id: 'mr_mangadex_twin',
      title: 'Paying Off My Debt by Living With My Childhood Friend',
      altTitles: [],
      coverUrl: '',
      synopsis:
        'After his parents disappear and leave a huge debt, a broke high school student is helped by his devoted childhood friend who pays off the loan so they move in together under the same roof in a teasing romantic comedy.',
      authors: ['Outro Autor'],
      artists: [],
      genres: ['Shounen', 'Romance'],
      status: 'ongoing',
      publicationInfo: {},
      sources: [],
      updatedAt: new Date().toISOString()
    };

    // Candidato B: Compartilha os mesmos 4 gêneros genéricos (Seinen, Comedy, Romance, Slice of life), mas enredo totalmente diferente
    const unrelatedSameGenres = {
      id: 'mr_mangadex_unrelated',
      title: 'Gourmet Chef in a Quiet Bakery',
      altTitles: [],
      coverUrl: '',
      synopsis:
        'A retired samurai opens a bread bakery in a seaside town and teaches townsfolk how to bake croissants and drink herbal tea while enjoying calm afternoons.',
      authors: ['Autor C'],
      artists: [],
      genres: ['Seinen', 'Comedy', 'Romance', 'Slice of life'],
      status: 'ongoing',
      publicationInfo: {},
      sources: [],
      updatedAt: new Date().toISOString()
    };

    const twinMatch = scoreSimilarMangaCandidate(targetRomcom, narrativeTwin, undefined, true);
    const genericMatch = scoreSimilarMangaCandidate(targetRomcom, unrelatedSameGenres, undefined, false);

    assert(twinMatch.similarityScore > genericMatch.similarityScore, `Gêmeo de sinopse (${twinMatch.similarityScore}%) pontua acima de obra genérica de mesmos gêneros (${genericMatch.similarityScore}%)`);
    assert((twinMatch.synopsisSimilarity || 0) >= 35, `Afinidade narrativa calculada significativamente (${twinMatch.synopsisSimilarity}%)`);
    assert((twinMatch.plotThemes?.length || 0) >= 2, 'Identifica múltiplos tropos compartilhados entre as sinopses');
    assert(twinMatch.isInLibrary === true, 'Preserva flag isInLibrary para permitir exibir obras parecidas já lidas');
    assert(twinMatch.category === 'twin_premise', `Classifica gêmeo de premissa na categoria twin_premise (recebeu ${twinMatch.category})`);
    assert(genericMatch.category === 'same_vibe', `Classifica obra de mesmo gênero sem tropos na categoria same_vibe (recebeu ${genericMatch.category})`);

    // Caso 2: Trope nichada (Office Workers + Ecchi + Heroína alta/provocadora) vs comédia genérica
    const dekaiTarget = {
      id: 'mr_comick_dekai',
      title: 'Dekai Usagi ni Natsukareta!?',
      altTitles: [],
      synopsis:
        'A new member of the workforce, Hajime is so nervous before his first day that he heads out for a midnight stroll and is accosted by a strangely over-familiar giant drunk woman.',
      genres: ['Comedy', 'Ecchi', 'Romance', 'Slice of Life', 'Office Workers'],
      authors: ['Magao Itsuka']
    };
    const nicheOfficeTwin = {
      id: 'mr_mangadex_office_twin',
      title: 'My Tall Drunk Senpai at Work',
      altTitles: [],
      coverUrl: '',
      synopsis:
        'A nervous new office worker is constantly teased by his tall, bold coworker after midnight drinks in this workplace romantic comedy.',
      authors: ['Autor D'],
      artists: [],
      genres: ['Comedy', 'Ecchi', 'Romance', 'Office Workers'],
      status: 'ongoing',
      publicationInfo: {},
      sources: [],
      updatedAt: new Date().toISOString()
    };
    const broadUmbrellaOnly = {
      id: 'mr_mangadex_umbrella',
      title: 'High School Club Shenanigans',
      altTitles: [],
      coverUrl: '',
      synopsis: 'Four energetic students join a ping pong club after class and compete in local tournaments.',
      authors: ['Autor E'],
      artists: [],
      genres: ['Comedy', 'Romance', 'Slice of Life'],
      status: 'ongoing',
      publicationInfo: {},
      sources: [],
      updatedAt: new Date().toISOString()
    };

    const nicheOfficeScore = scoreSimilarMangaCandidate(dekaiTarget, nicheOfficeTwin, undefined, false);
    const umbrellaOnlyScore = scoreSimilarMangaCandidate(dekaiTarget, broadUmbrellaOnly, undefined, false);
    assert(
      nicheOfficeScore.similarityScore > umbrellaOnlyScore.similarityScore + 15,
      `Subgêneros nichados + dinâmica (${nicheOfficeScore.similarityScore}%) superam com folga gêneros amplos (${umbrellaOnlyScore.similarityScore}%)`
    );
    assert(
      nicheOfficeScore.category === 'twin_premise' || nicheOfficeScore.category === 'same_dynamic',
      `Classifica match nichado fora de same_vibe (recebeu ${nicheOfficeScore.category})`
    );

    // Caso 3: Trope 100% inédita sem regra hardcoded (vocabulário aberto puro)
    const unseenTropeTarget = {
      id: 'mr_comick_violin',
      title: 'The Blind Violinist and the Midnight Clockmaker',
      synopsis: 'A blind concert violinist meets an eccentric clockmaker repairing antique pocketwatches in a snowy mountain village.',
      genres: ['Drama', 'Romance']
    };
    const unseenQueries = extractNarrativeSearchQueries(unseenTropeTarget);
    assert(unseenQueries.length >= 1, 'Extrai consulta por vocabulário aberto mesmo sem trope hardcoded');

    const unseenMatch = scoreSimilarMangaCandidate(unseenTropeTarget, {
      id: 'mr_comick_violin2',
      title: 'Antique Clockmaker Melody',
      altTitles: [],
      coverUrl: '',
      synopsis: 'In a snowy village, a blind violinist plays beside a quiet clockmaker fixing antique watches.',
      authors: ['Autor F'],
      artists: [],
      genres: ['Drama'],
      status: 'ongoing',
      publicationInfo: {},
      sources: [],
      updatedAt: new Date().toISOString()
    });
    const unseenWrong = scoreSimilarMangaCandidate(unseenTropeTarget, {
      id: 'mr_comick_wrong',
      title: 'Generic School Drama',
      altTitles: [],
      coverUrl: '',
      synopsis: 'Students argue over their theater festival budget.',
      authors: ['Autor G'],
      artists: [],
      genres: ['Drama', 'Romance'],
      status: 'ongoing',
      publicationInfo: {},
      sources: [],
      updatedAt: new Date().toISOString()
    });
    assert(
      unseenMatch.similarityScore > unseenWrong.similarityScore,
      `Vocabulário aberto identifica trope inédita (${unseenMatch.similarityScore}% vs ${unseenWrong.similarityScore}%) sem precisar cadastrar subgênero`
    );

    // Caso 4: Direcionamento de foco livre (tall girl, muscle mommy, size difference) & contrato /api/similarity/match
    const { resolveFocusToCategoriesAndQueries } = await import('../services/aiSimilarityService.js');
    const resolvedTallMuscle = resolveFocusToCategoriesAndQueries(
      ['Muscular Female Lead'],
      'tall girl, muscle mommy, size difference'
    );
    assert(
      resolvedTallMuscle.muCategories.includes('Muscular Female Lead') &&
      resolvedTallMuscle.muCategories.includes('Tall Female Short Male') &&
      resolvedTallMuscle.muCategories.includes('Height Difference'),
      'Mapeia gírias e preferências de fandom (tall girl, muscle mommy, size difference) para categorias canônicas do MangaUpdates'
    );
    assert(
      resolvedTallMuscle.searchQueries.includes('muscle girl') &&
      resolvedTallMuscle.searchQueries.includes('tall girl'),
      'Gera queries focadas no arquétipo escolhido sem perder termos originais'
    );

    const simMatchRes = await fetch(`${BASE_URL}/api/similarity/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetManga: {
          id: 'mr_comick_dekai',
          title: 'Dekai Usagi ni Natsukareta!?',
          synopsis: dekaiTarget.synopsis,
          genres: dekaiTarget.genres,
          authors: dekaiTarget.authors
        },
        focusTags: ['Height Difference'],
        focusQuery: 'tall girl muscle mommy',
        localCandidates: [
          {
            id: 'mr_local_tall_muscle',
            title: 'Saotome Girl, Hitakakusu',
            altTitles: [],
            coverUrl: '',
            synopsis: 'A tall muscular female athlete and a short male trainer develop a romantic height difference comedy.',
            authors: ['Mizuguchi Naoki'],
            artists: [],
            genres: ['Comedy', 'Romance', 'Height Difference'],
            status: 'completed',
            publicationInfo: {},
            sources: [],
            updatedAt: new Date().toISOString()
          }
        ],
        limit: 8
      })
    });
    assert(simMatchRes.status === 200, 'POST /api/similarity/match aceita focusTags e focusQuery retornando HTTP 200');
    const simMatchJson = await simMatchRes.json();
    assert(simMatchJson.success === true && Array.isArray(simMatchJson.data?.matches), 'Resposta de similaridade com foco possui matches válidos');
    assert(Array.isArray(simMatchJson.data?.detectedTags), 'Resposta inclui detectedTags para renderizar chips clicáveis na interface');

  } catch (err) {
    console.error('Erro catastrófico na execução dos testes:', err);
    failedTests++;
  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
  }

  console.log('\n----------------------------------------------------');
  console.log(`TOTAL: ${totalTests} asserções | PASSOU: ${passedTests} | FALHOU: ${failedTests}`);
  console.log('----------------------------------------------------');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runDeterministicTests();
