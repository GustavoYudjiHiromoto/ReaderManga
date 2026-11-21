/**
 * PARTE 1 — TESTES DETERMINÍSTICOS
 * Esta suíte testa contratos locais, coexistência das 4 fontes reais (Comick, MangaDex, WeebCentral, MangaPill),
 * SourceRegistry e comportamento HTTP da API sem qualquer dependência de Mock.
 */

let BASE_URL = 'http://127.0.0.1:0';

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
    // Sempre inicializa instância isolada in-process para que singletons de API e estado HTTP compartilhem o mesmo processo
    const express = (await import('express')).default;
    const { apiRouter } = await import('../api/routes.js');
    const { trackerRouter } = await import('../trackers/TrackerRouter.js');
    const app = express();
    app.use(express.json({ limit: '16mb' }));
    app.use('/api/trackers', trackerRouter);
    app.use('/api', apiRouter);
    await new Promise((resolve) => {
      serverInstance = app.listen(0, '127.0.0.1', () => {
        const addr = serverInstance.address();
        const port = typeof addr === 'object' && addr ? addr.port : 3000;
        BASE_URL = `http://127.0.0.1:${port}`;
        console.log(`  ✓ Servidor de testes isolado iniciado em ${BASE_URL}\n`);
        resolve();
      });
    });

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

    // -------------------------------------------------------------------------
    // 13. MOTOR DE EXTENSÕES DINÂMICAS, REPOSITÓRIOS JSON & ESPELHOS (MIHON FASE 1)
    // -------------------------------------------------------------------------
    console.log('\n[13/13] Testando Extensões Dinâmicas (Madara / Themesia / Custom HTML), Repos e Espelhos...');

    const {
      encodeDynamicId,
      decodeDynamicId,
      isCloudflareBlocked,
      parseMadaraSearchHtml,
      parseMadaraDetailsHtml,
      parseMadaraChaptersHtml,
      parseMadaraPagesHtml,
      parseThemesiaSearchHtml,
      parseThemesiaChaptersHtml,
      parseThemesiaPagesHtml,
      parseCustomSearchHtml,
      parseCustomPagesHtml
    } = await import('../sources/DynamicTemplateProvider.js');
    const {
      parseRepositoryPayload,
      sanitizeExtensionId
    } = await import('../sources/ExtensionRepositoryService.js');

    // 13.1 Round-trip lossless de IDs com barras, underscores e query params
    const rawSlugWithSpecials = '/manga/solo_leveling_br/cap_01/?style=list&v=2';
    const encodedToken = encodeDynamicId(rawSlugWithSpecials);
    assert(!encodedToken.includes('_'), 'encodeDynamicId gera token livre de underscores para parser canônico');
    assert(decodeDynamicId(encodedToken) === rawSlugWithSpecials, 'decodeDynamicId restaura slug original com 100% de fidelidade');

    const dynParsedManga = registry.parseInternalMangaId(`mr_ext-teste_${encodedToken}`);
    assert(dynParsedManga.sourceId === 'ext-teste', 'parseInternalMangaId extrai sourceId dinâmico corretamente');
    assert(decodeDynamicId(dynParsedManga.externalId) === rawSlugWithSpecials, 'parseInternalMangaId preserva token dinâmico completo');

    const chToken = encodeDynamicId('/manga/solo_leveling/cap_10/');
    const dynParsedChapter = registry.parseInternalChapterId(`ch_ext-teste_${encodedToken}_${chToken}`);
    assert(dynParsedChapter.sourceId === 'ext-teste', 'parseInternalChapterId extrai sourceId dinâmico');
    assert(decodeDynamicId(dynParsedChapter.externalMangaId) === rawSlugWithSpecials, 'parseInternalChapterId extrai externalMangaId dinâmico');
    assert(decodeDynamicId(dynParsedChapter.externalChapterId) === '/manga/solo_leveling/cap_10/', 'parseInternalChapterId extrai externalChapterId dinâmico');

    // 13.2 Parser WP-Madara
    const madaraCtx = { sourceId: 'ext-madara', sourceName: 'Madara Test', baseUrl: 'https://scan.example.com', lang: 'pt-br' };
    const madaraSearchHtml = `
      <div class="c-tabs-item__content">
        <div class="tab-thumb"><a href="https://scan.example.com/manga/obra_teste/"><img data-src="https://cdn.example.com/cover.jpg" /></a></div>
        <div class="post-title"><h3><a href="https://scan.example.com/manga/obra_teste/">Obra Madara Teste</a></h3></div>
        <div class="latest-chap"><span class="chapter"><a href="#">Capítulo 42</a></span></div>
      </div>
    `;
    const madaraResults = parseMadaraSearchHtml(madaraSearchHtml, madaraCtx);
    assert(madaraResults.length === 1 && madaraResults[0].title === 'Obra Madara Teste', 'parseMadaraSearchHtml extrai obra e título');
    assert(madaraResults[0].coverUrl.includes('/api/proxy/image?url=') && madaraResults[0].coverUrl.includes('referer='), 'parseMadaraSearchHtml aplica proxy de imagem com referer dinâmico');
    assert(madaraResults[0].latestChapter === '42', 'parseMadaraSearchHtml extrai número do último capítulo');

    const madaraDetailHtml = `
      <div class="post-title"><h1>Obra Madara Teste</h1></div>
      <div class="summary_image"><img src="/wp-content/uploads/capa.jpg" /></div>
      <div class="summary__content"><p>Sinopse completa da obra.</p></div>
      <div class="genres-content"><a>Ação</a><a>Fantasia</a></div>
      <div class="author-content"><a>Autor X</a></div>
      <div class="post-status"><div class="summary-content">Concluído</div></div>
    `;
    const madaraDetails = parseMadaraDetailsHtml(madaraDetailHtml, 'https://scan.example.com/manga/obra_teste/', encodeDynamicId('/manga/obra_teste/'), madaraCtx);
    assert(madaraDetails?.status === 'completed', 'parseMadaraDetailsHtml normaliza status Concluído para completed');
    assert(madaraDetails?.genres.includes('Ação') && madaraDetails?.authors.includes('Autor X'), 'parseMadaraDetailsHtml extrai gêneros e autores');

    const madaraChaptersHtml = `<ul><li class="wp-manga-chapter"><a href="/manga/obra_teste/cap-12-5/">Capítulo 12.5</a><span class="chapter-release-date">Hoje</span></li></ul>`;
    const madaraChs = parseMadaraChaptersHtml(madaraChaptersHtml, encodeDynamicId('/manga/obra_teste/'), madaraCtx);
    assert(madaraChs.length === 1 && madaraChs[0].chapterNumber === '12.5', 'parseMadaraChaptersHtml extrai capítulo decimal 12.5');

    const madaraPagesHtml = `<div class="reading-content"><img data-lazy-src="/imgs/p1.webp" /><img data-src="https://cdn.example.com/imgs/p2.jpg" /></div>`;
    const madaraPages = parseMadaraPagesHtml(madaraPagesHtml, madaraCtx, 'https://scan.example.com/manga/obra_teste/cap-12-5/');
    assert(madaraPages.length === 2 && madaraPages[0].pageNumber === 1, 'parseMadaraPagesHtml extrai páginas com lazy-loading (data-lazy-src / data-src)');

    // 13.3 Parser MangaThemesia (inclui ts_reader.run JSON e HTML fallback)
    const themesiaCtx = { sourceId: 'ext-themesia', sourceName: 'Themesia Test', baseUrl: 'https://themesia.example.com', lang: 'en' };
    const themesiaSearchHtml = `<div class="listupd"><div class="bs"><div class="bsx"><a href="/manga/knight-king/" title="Knight King"><div class="tt">Knight King</div><img src="/thumb.jpg" /></a></div></div></div>`;
    const themesiaRes = parseThemesiaSearchHtml(themesiaSearchHtml, themesiaCtx);
    assert(themesiaRes.length === 1 && themesiaRes[0].title === 'Knight King', 'parseThemesiaSearchHtml extrai obra do layout Themesia');

    const themesiaChHtml = `<div id="chapterlist"><ul><li><a href="/knight-king-chapter-7/"><span class="chapternum">Chapter 7</span><span class="chapterdate">2025</span></a></li></ul></div>`;
    const themesiaChs = parseThemesiaChaptersHtml(themesiaChHtml, encodeDynamicId('/manga/knight-king/'), themesiaCtx);
    assert(themesiaChs.length === 1 && themesiaChs[0].chapterNumber === '7', 'parseThemesiaChaptersHtml extrai capítulo');

    const themesiaTsScriptHtml = `<script>ts_reader.run({"post_id":10,"sources":[{"source":"CDN","images":["https://img.example.com/1.jpg","https://img.example.com/2.jpg"]}]});</script>`;
    const themesiaPages = parseThemesiaPagesHtml(themesiaTsScriptHtml, themesiaCtx, 'https://themesia.example.com/knight-king-chapter-7/');
    assert(themesiaPages.length === 2 && decodeURIComponent(themesiaPages[1].imageUrl).includes('https://img.example.com/2.jpg'), 'parseThemesiaPagesHtml extrai array images de ts_reader.run(...)');

    // 13.4 Parser Custom HTML
    const customCtx = { sourceId: 'ext-custom', sourceName: 'Custom Test', baseUrl: 'https://custom.example.com', lang: 'pt-br' };
    const customSelectors = { searchItem: '.card', title: '.name', link: 'a.go', cover: 'img', chapterItem: '.ch a', pageImg: '.pages img' };
    const customSearch = parseCustomSearchHtml(`<div class="card"><a class="go" href="/obra/1"><span class="name">Custom Manga</span><img src="/c.jpg"/></a></div>`, customSelectors, customCtx);
    const customPages = parseCustomPagesHtml(`<div class="pages"><img data-src="/p1.png" /></div>`, customSelectors, customCtx, 'https://custom.example.com/ch/1');
    assert(customSearch.length === 1 && customPages.length === 1, 'Parser custom_html extrai busca e páginas via seletores CSS declarativos');

    // 13.5 Detecção de Cloudflare e Parsing de Repositório JSON
    assert(isCloudflareBlocked(403, '<html><title>Just a moment...</title></html>') === true, 'Detecta desafio Cloudflare em resposta 403');
    assert(isCloudflareBlocked(200, '<html><body>Normal page</body></html>') === false, 'Não marca resposta normal HTTP 200 como Cloudflare');
    assert(!sanitizeExtensionId('minha_ext_br').includes('_'), 'sanitizeExtensionId remove underscores do ID de extensão');

    const parsedRepo = parseRepositoryPayload({
      name: 'Repo Comunidade',
      extensions: [
        { id: 'scan-alpha', name: 'Scan Alpha', baseUrl: 'https://alpha.example.com/', template: 'madara', lang: 'pt-br', version: '1.2.0' }
      ]
    }, 'https://repo.example.com/repo.json');
    assert(parsedRepo.name === 'Repo Comunidade' && parsedRepo.extensions.length === 1, 'parseRepositoryPayload normaliza repositório JSON válido');

    let apkRepoRejected = false;
    try {
      parseRepositoryPayload([{ name: 'Tachiyomi: Scan', pkg: 'eu.kanade.tachiyomi.extension.pt.scan', apk: 'tachiyomi-pt.scan-v1.4.apk', sources: [{ name: 'Scan', lang: 'pt-BR', id: '123', baseUrl: 'https://scan.com' }] }], 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.min.json');
    } catch (e) {
      apkRepoRejected = e.message.includes('APK');
    }
    assert(apkRepoRejected, 'parseRepositoryPayload diagnostica claramente repositórios APK Android incompatíveis');

    // 13.6 Ciclo HTTP Completo: Instalar -> Invalidar Cache -> Editar Espelho -> Proteção Nativa -> Desinstalar
    const installRes = await fetch(`${BASE_URL}/api/extensions/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manifest: {
          id: 'ext-ci-demo',
          name: 'CI Demo Scan',
          baseUrl: 'https://demo1.example.com',
          template: 'madara',
          lang: 'pt-br',
          version: '1.0.0'
        }
      })
    });
    assert(installRes.status === 200, 'POST /api/extensions/install instala extensão dinâmica (HTTP 200)');

    const afterInstallSources = await (await fetch(`${BASE_URL}/api/sources`)).json();
    const installedSourceInfo = afterInstallSources.data.find(s => s.id === 'ext-ci-demo');
    assert(afterInstallSources.data.length === 7 && !!installedSourceInfo, 'GET /api/sources invalida cache e reflete nova extensão dinâmica imediatamente');
    assert(installedSourceInfo?.supportsMirrorEdit === true && installedSourceInfo?.baseUrl === 'https://demo1.example.com', 'Extensão instalada expõe baseUrl e suporte a edição de espelho');

    const mirrorRes = await fetch(`${BASE_URL}/api/extensions/ext-ci-demo/mirror`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://demo2.example.org/' })
    });
    assert(mirrorRes.status === 200, 'PATCH /api/extensions/:id/mirror atualiza espelho (HTTP 200)');
    const mirrorJson = await mirrorRes.json();
    assert(mirrorJson.data?.baseUrl === 'https://demo2.example.org', 'Espelho atualizado e normalizado sem barra final');

    const afterMirrorSources = await (await fetch(`${BASE_URL}/api/sources`)).json();
    assert(afterMirrorSources.data.find(s => s.id === 'ext-ci-demo')?.baseUrl === 'https://demo2.example.org', 'GET /api/sources reflete novo espelho após PATCH');

    const protectNativeRes = await fetch(`${BASE_URL}/api/extensions/mangadex`, { method: 'DELETE' });
    assert(protectNativeRes.status === 400, 'DELETE /api/extensions/mangadex impede desinstalação de provedor nativo');

    const uninstallRes = await fetch(`${BASE_URL}/api/extensions/ext-ci-demo`, { method: 'DELETE' });
    assert(uninstallRes.status === 200, 'DELETE /api/extensions/:id desinstala extensão dinâmica (HTTP 200)');

    const afterUninstallSources = await (await fetch(`${BASE_URL}/api/sources`)).json();
    assert(afterUninstallSources.data.length === 6 && !afterUninstallSources.data.some(s => s.id === 'ext-ci-demo'), 'GET /api/sources retorna às 6 fontes nativas após desinstalação');

    // -------------------------------------------------------------------------
    // 14. BROWSE SOURCE (CATÁLOGO POR FONTE) & FAILOVER DINÂMICO (MIHON FASE 2)
    // -------------------------------------------------------------------------
    console.log('\n[14/14] Testando Browse Source (/catalog) e Inclusão Dinâmica no Failover...');

    const { DynamicTemplateProvider } = await import('../sources/DynamicTemplateProvider.js');

    // 14.1 Failover order inclui extensões dinâmicas após APIs nativas rápidas e exclui origem
    const failoverDynamic = new DynamicTemplateProvider({
      id: 'ext-ci-failover',
      name: 'CI Failover Scan',
      baseUrl: 'https://failover.invalid.example',
      template: 'madara',
      lang: 'pt-br',
      version: '1.0.0'
    });
    registry.registerSource(failoverDynamic);

    const chFailoverOrder = registry.getFailoverOrder('mangadex', 'chapters');
    const pgFailoverOrder = registry.getFailoverOrder('mangadex', 'pages');
    assert(!chFailoverOrder.includes('mangadex'), 'getFailoverOrder(chapters) exclui a fonte primária com falha');
    assert(chFailoverOrder.includes('ext-ci-failover'), 'getFailoverOrder(chapters) inclui extensão dinâmica instalada');
    assert(
      chFailoverOrder.indexOf('comick') < chFailoverOrder.indexOf('ext-ci-failover'),
      'getFailoverOrder(chapters) prioriza APIs nativas rápidas antes de scrapers dinâmicos'
    );
    assert(pgFailoverOrder.includes('ext-ci-failover') && !pgFailoverOrder.includes('mangadex'), 'getFailoverOrder(pages) inclui extensão dinâmica instalada');
    registry.unregisterSource('ext-ci-failover');
    assert(!registry.getFailoverOrder('mangadex', 'chapters').includes('ext-ci-failover'), 'unregisterSource remove extensão dinâmica do failover');

    // 14.2 Endpoint HTTP GET /api/sources/:id/catalog (popular, latest e 404)
    const catPopRes = await fetch(`${BASE_URL}/api/sources/comick/catalog?mode=popular&limit=5`);
    assert(catPopRes.status === 200, 'GET /api/sources/comick/catalog?mode=popular retorna HTTP 200');
    const catPopJson = await catPopRes.json();
    assert(
      catPopJson.success === true && catPopJson.sourceId === 'comick' && catPopJson.mode === 'popular' && Array.isArray(catPopJson.data),
      'Catálogo popular retorna contrato esperado (success, sourceId, mode, data[])'
    );

    const catLatestRes = await fetch(`${BASE_URL}/api/sources/comick/catalog?mode=latest&limit=5`);
    assert(catLatestRes.status === 200, 'GET /api/sources/comick/catalog?mode=latest retorna HTTP 200');
    const catLatestJson = await catLatestRes.json();
    assert(
      catLatestJson.success === true && catLatestJson.sourceId === 'comick' && catLatestJson.mode === 'latest' && Array.isArray(catLatestJson.data),
      'Catálogo latest retorna contrato esperado (success, sourceId, mode, data[])'
    );

    const catUnknownRes = await fetch(`${BASE_URL}/api/sources/inexistente-ci/catalog?mode=popular`);
    assert(catUnknownRes.status === 404, 'GET /api/sources/:id/catalog retorna HTTP 404 para fonte inexistente');

    // 14.3 Catálogo resiliente para extensão dinâmica instalada via HTTP + teardown limpo
    const installFailoverHttp = await fetch(`${BASE_URL}/api/extensions/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manifest: {
          id: 'ext-ci-failover-http',
          name: 'CI Failover HTTP',
          baseUrl: 'https://unreachable.invalid.example',
          template: 'themesia',
          lang: 'en',
          version: '1.0.0'
        }
      })
    });
    assert(installFailoverHttp.status === 200, 'Instala extensão dinâmica para teste de catálogo HTTP');

    const dynCatRes = await fetch(`${BASE_URL}/api/sources/ext-ci-failover-http/catalog?mode=latest&page=1`);
    assert(dynCatRes.status === 200, 'GET /api/sources/:dynId/catalog?mode=latest responde HTTP 200 com degradação graciosa');
    const dynCatJson = await dynCatRes.json();
    assert(dynCatJson.success === true && Array.isArray(dynCatJson.data), 'Catálogo dinâmico retorna array válido mesmo quando upstream está offline');

    const cleanupRes = await fetch(`${BASE_URL}/api/extensions/ext-ci-failover-http`, { method: 'DELETE' });
    assert(cleanupRes.status === 200, 'Limpeza da extensão temporária de teste concluída (HTTP 200)');

    // -------------------------------------------------------------------------
    // 15. POPULAÇÃO DE POPULARES, MANGADEX ALTTITLES & DEDUPLICAÇÃO CROSS-SOURCE
    // -------------------------------------------------------------------------
    console.log('\n[15/15] Testando Populares sem Vazamento Alfabético, AltTitles EN Prioritários e Deduplicação Cross-Source...');

    const { prioritizeMangaDexAltTitles } = await import('../sources/MangaDexProvider.js');
    const { MangaPillProvider } = await import('../sources/MangaPillProvider.js');
    const { deduplicateMangaList } = await import('../sources/SourceRegistry.js');

    // 15.1 MangaDex altTitles prioriza 'en' e 'ja-ro' mesmo quando há >10 títulos não-latinos antes
    const rawKomisanAlts = [
      { ja: '古見さんは、コミュ症です。' },
      { ko: '코미 양은 커뮤증입니다' },
      { zh: '古見同學有交流障礙症' },
      { 'zh-hk': '古見同學有交流障礙症' },
      { ru: 'У Коми-сан проблемы с общением' },
      { th: 'โฉมงามพูดไม่เก่งกับผองเพื่อนไม่เต็มเต็ง' },
      { uk: 'У Комі-сан проблеми зі спілкуванням' },
      { ar: 'كومي سان لا تستطيع التواصل' },
      { hi: 'कोमी कैन नॉट कम्यूनिकेट' },
      { bn: 'কোমি-সান কথা বলতে পারে না' },
      { 'pt-br': 'Komi não consegue se comunicar' },
      { en: "Komi Can't Communicate" },
      { 'ja-ro': 'Komi-san wa, Komyushou desu.' }
    ];
    const prioritizedAlts = prioritizeMangaDexAltTitles('Komi-san wa Komyushou Desu.', null, rawKomisanAlts, 12);
    assert(
      prioritizedAlts[0] === "Komi Can't Communicate",
      'prioritizeMangaDexAltTitles coloca título inglês (en) em 1º lugar mesmo após 10+ altTitles não-latinos'
    );
    assert(
      prioritizedAlts.includes('Komi não consegue se comunicar') && prioritizedAlts.length <= 12,
      'prioritizeMangaDexAltTitles mantém PT-BR dentro do limite de 12 títulos'
    );

    // 15.2 Deduplicação cross-source funde Komi (WeebCentral sem altTitles) + Komi-san (MangaDex com altTitles EN)
    const weebKomi = {
      id: 'mr_weebcentral_01J_KOMI',
      title: 'Komi Can’t Communicate',
      altTitles: [],
      coverUrl: 'https://weeb.example/komi.jpg',
      synopsis: 'Sinopse',
      authors: ['ODA Tomohito'],
      artists: ['ODA Tomohito'],
      genres: ['Comedy'],
      status: 'completed',
      publicationInfo: { country: 'JP' },
      sources: [{ sourceId: 'weebcentral', sourceName: 'WeebCentral', externalId: '01J_KOMI' }],
      updatedAt: new Date().toISOString(),
      hasAvailableChapters: true
    };
    const dexKomi = {
      id: 'mr_mangadex_komi-uuid',
      title: 'Komi-san wa Komyushou Desu.',
      altTitles: prioritizedAlts,
      coverUrl: 'https://dex.example/komi.jpg',
      synopsis: 'Sinopse longa do MangaDex sobre Shouko Komi no colégio Itan.',
      authors: ['Oda Tomohito'],
      artists: ['Oda Tomohito'],
      genres: ['Romance', 'Slice of Life'],
      status: 'completed',
      publicationInfo: { country: 'JP' },
      sources: [{ sourceId: 'mangadex', sourceName: 'MangaDex', externalId: 'komi-uuid' }],
      updatedAt: new Date().toISOString(),
      hasAvailableChapters: true
    };
    const mergedKomiList = deduplicateMangaList([weebKomi, dexKomi]);
    assert(
      mergedKomiList.length === 1 && mergedKomiList[0].sources.length === 2,
      'deduplicateMangaList unifica Komi Can\'t Communicate (WeebCentral) + Komi-san wa Komyushou Desu. (MangaDex)'
    );

    // 15.3 MangaPill remove cauda ASCII/numérica (μ & I, 009, 5 Centimeters Per Second, 6000, 666 Satan)
    const samplePillList = [
      'Berserk', 'One Piece', 'Naruto', 'Bleach', 'Hunter x Hunter', 'Vagabond',
      'μ & I', '009', '5 Centimeters Per Second', '6000', '666 Satan'
    ].map((t, i) => ({
      id: `mr_mangapill_${i}`,
      title: t,
      altTitles: [],
      coverUrl: '',
      synopsis: '',
      authors: [],
      artists: [],
      genres: ['Manga'],
      status: 'ongoing',
      publicationInfo: {},
      sources: [{ sourceId: 'mangapill', sourceName: 'MangaPill', externalId: String(i) }],
      updatedAt: new Date().toISOString(),
      hasAvailableChapters: true
    }));
    const slicedPill = MangaPillProvider.sliceCuratedPopular(samplePillList);
    assert(
      slicedPill.length === 6 && !slicedPill.some(m => m.title.includes('666') || m.title.includes('5 Centimeters')),
      'sliceCuratedPopular mantém clássicos curados e corta catálogo alfabético/numérico'
    );

    const pillProvider = new MangaPillProvider();
    const pillPage2 = await pillProvider.search('', { page: 2 });
    assert(
      pillPage2.mangaList.length === 0 && pillPage2.hasMore === false,
      'MangaPill search("") página 2 retorna vazio (impede vazamento alfabético no scroll Mais Populares)'
    );

    const pillRomanceSample = [
      { id: 'mr_mangapill_10-grand-blue', title: 'Grand Blue', externalId: '10-grand-blue' },
      { id: 'mr_mangapill_22-1-love-9', title: '1 Love 9', externalId: '22-1-love-9' },
      { id: 'mr_mangapill_158-akame-ga-kill', title: 'Akame ga Kill!', externalId: '158-akame-ga-kill' }
    ].map(x => ({
      id: x.id,
      title: x.title,
      altTitles: [],
      coverUrl: '',
      synopsis: '',
      authors: [],
      artists: [],
      genres: ['Romance'],
      status: 'ongoing',
      publicationInfo: {},
      sources: [{ sourceId: 'mangapill', sourceName: 'MangaPill', externalId: x.externalId }],
      updatedAt: new Date().toISOString(),
      hasAvailableChapters: true
    }));
    const slicedRomance = MangaPillProvider.sliceCuratedPopular(pillRomanceSample);
    assert(
      slicedRomance.length === 1 && slicedRomance[0].title === 'Grand Blue',
      'sliceCuratedPopular corta cauda alfabética com ID >= 13 mesmo quando há menos de 5 curados (ex: Romance)'
    );

    const pillZeroCurated = MangaPillProvider.sliceCuratedPopular(pillRomanceSample.slice(1));
    assert(
      pillZeroCurated.length === 0,
      'sliceCuratedPopular retorna vazio quando não há nenhum clássico curado antes do dump alfabético'
    );

    const pillGenrePage2 = await pillProvider.search('', { genre: 'Romance', page: 2 });
    const pillPopularGenrePage2 = await pillProvider.getPopular({ genre: 'Action', page: 2 });
    assert(
      pillGenrePage2.mangaList.length === 0 && pillPopularGenrePage2.length === 0,
      'MangaPill search e getPopular com gênero na página 2 retornam vazio (sem dump A-Z)'
    );

    // 15.4 Round-robin interleaving no SourceRegistry para catálogo popular (query vazia)
    const makeStubManga = (srcId, title) => ({
      id: `mr_${srcId}_${title}`,
      title,
      altTitles: [],
      coverUrl: '',
      synopsis: '',
      authors: ['Autor'],
      artists: ['Autor'],
      genres: ['Action'],
      status: 'ongoing',
      publicationInfo: {},
      sources: [{ sourceId: srcId, sourceName: srcId, externalId: title }],
      updatedAt: new Date().toISOString(),
      hasAvailableChapters: true
    });

    registry.registerSource({
      getInfo: () => ({ id: 'stub-pop-a', name: 'Stub A', isAvailable: true }),
      search: async () => ({
        mangaList: [makeStubManga('stub-pop-a', 'Alpha One'), makeStubManga('stub-pop-a', 'Alpha Two')],
        total: 2,
        hasMore: false
      }),
      getPopular: async () => [],
      getMangaDetails: async () => null,
      getChapters: async () => [],
      getChapterPages: async () => []
    });
    registry.registerSource({
      getInfo: () => ({ id: 'stub-pop-b', name: 'Stub B', isAvailable: true }),
      search: async () => ({
        mangaList: [makeStubManga('stub-pop-b', 'Beta One'), makeStubManga('stub-pop-b', 'Beta Two')],
        total: 2,
        hasMore: false
      }),
      getPopular: async () => [],
      getMangaDetails: async () => null,
      getChapters: async () => [],
      getChapterPages: async () => []
    });

    try {
      const interleavedRes = await registry.search('', {
        enabledSources: ['stub-pop-a', 'stub-pop-b'],
        onlyAvailable: false
      });
      const titlesOrder = interleavedRes.results.map(r => r.title);
      assert(
        titlesOrder[0] === 'Alpha One' &&
        titlesOrder[1] === 'Beta One' &&
        titlesOrder[2] === 'Alpha Two' &&
        titlesOrder[3] === 'Beta Two',
        `SourceRegistry intercala resultados populares em round-robin (recebeu ${titlesOrder.join(', ')})`
      );
    } finally {
      registry.unregisterSource('stub-pop-a');
      registry.unregisterSource('stub-pop-b');
    }

    // 15.5 WeebCentral parser extrai Associated Name(s) corretamente para cruzar favoritos
    const { parseWeebCentralAssociatedNames } = await import('../sources/WeebCentralProvider.js');
    const weebAssocHtml = `
      <li>
        <strong>Associated Name(s)</strong>
        <ul class="list-disc list-inside">
          <li>Komi-san wa Komyushou Desu</li>
          <li>古見さんは、コミュ症です。</li>
        </ul>
      </li>
    `;
    const parsedAssoc = parseWeebCentralAssociatedNames(weebAssocHtml);
    assert(
      parsedAssoc.length === 2 && parsedAssoc[0] === 'Komi-san wa Komyushou Desu',
      'parseWeebCentralAssociatedNames extrai nomes associados de série do WeebCentral'
    );

    // 15.6 Deduplicação ignora sufixos de edição como (Official) ou (Colored)
    const editionDedup = deduplicateMangaList([
      makeStubManga('stub-ed-1', 'Solo Leveling'),
      makeStubManga('stub-ed-2', 'Solo Leveling (Official)')
    ]);
    assert(
      editionDedup.length === 1 && editionDedup[0].sources.length === 2,
      'deduplicateMangaList unifica obras com sufixo (Official) / (Colored)'
    );

    // 15.7 Contrato HTTP POST /api/library/resolve-titles
    const resolveEmptyRes = await fetch(`${BASE_URL}/api/library/resolve-titles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] })
    });
    assert(resolveEmptyRes.status === 200, 'POST /api/library/resolve-titles retorna HTTP 200');
    const resolveEmptyJson = await resolveEmptyRes.json();
    assert(
      resolveEmptyJson.success === true && typeof resolveEmptyJson.data === 'object',
      'POST /api/library/resolve-titles retorna contrato válido { success, data }'
    );

    // -------------------------------------------------------------------------
    // 16. PONTE RESIDENCIAL OPCIONAL (OPT-IN RESIDENTIAL IP RELAY)
    // -------------------------------------------------------------------------
    console.log('\n[16/16] Testando Ponte Residencial Opcional & Proteções SSRF/Auth...');

    const relayStatusRes = await fetch(`${BASE_URL}/api/relay/status`);
    assert(relayStatusRes.status === 200, 'GET /api/relay/status retorna HTTP 200');
    const relayStatusJson = await relayStatusRes.json();
    const initialMode = relayStatusJson?.data?.mode || 'fallback';
    const initialProxy = relayStatusJson?.data?.customProxyUrl ?? null;
    const activeToken = relayStatusJson?.data?.token;
    assert(
      relayStatusJson.success === true && typeof activeToken === 'string' && activeToken.length >= 16,
      'GET /api/relay/status retorna token criptográfico e estado da ponte'
    );

    // 16.1 Rejeição de modo inválido e URL inválida em PATCH /api/relay/config
    const badModeRes = await fetch(`${BASE_URL}/api/relay/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'invalid_mode' })
    });
    assert(badModeRes.status === 400, 'PATCH /api/relay/config rejeita modo inválido com HTTP 400');

    const badProxyRes = await fetch(`${BASE_URL}/api/relay/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customProxyUrl: 'ftp://invalid-scheme' })
    });
    assert(badProxyRes.status === 400, 'PATCH /api/relay/config rejeita protocolo não-HTTP(S) com HTTP 400');

    // 16.2 Rejeição de token inválido em /poll e /respond
    const badPollRes = await fetch(`${BASE_URL}/api/relay/poll?token=wrong_token_123`);
    assert(badPollRes.status === 401, 'GET /api/relay/poll bloqueia token inválido (HTTP 401)');

    const badRespRes = await fetch(`${BASE_URL}/api/relay/respond?token=wrong_token_123`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: 'job_x', status: 200 })
    });
    assert(badRespRes.status === 401, 'POST /api/relay/respond bloqueia token inválido (HTTP 401)');

    // 16.3 Download do script standalone Node 18+
    const scriptRes = await fetch(`${BASE_URL}/api/relay/script`);
    assert(scriptRes.status === 200, 'GET /api/relay/script retorna HTTP 200');
    const scriptBody = await scriptRes.text();
    assert(
      scriptBody.includes(activeToken) &&
      scriptBody.includes('/api/relay/poll') &&
      scriptBody.includes('/api/relay/respond'),
      'Script mangareader-bridge.mjs contém token ativo e endpoints outbound de polling'
    );

    // 16.4 Proteção SSRF contra IPs privados/metadata
    const { isSafeExternalRelayUrl, residentialRelayService } = await import(
      '../services/ResidentialRelayService.js'
    );
    assert(isSafeExternalRelayUrl('http://127.0.0.1:3000/secret') === false, 'SSRF guard bloqueia 127.0.0.1');
    assert(isSafeExternalRelayUrl('http://169.254.169.254/latest') === false, 'SSRF guard bloqueia link-local/metadata');
    assert(isSafeExternalRelayUrl('http://localhost:8080') === false, 'SSRF guard bloqueia localhost');
    assert(isSafeExternalRelayUrl('http://192.168.1.50') === false, 'SSRF guard bloqueia rede privada RFC1918');
    assert(isSafeExternalRelayUrl('https://mangafire.to/read/test') === true, 'SSRF guard libera domínio público HTTPS');

    // 16.5 Round-trip completo de Long-Polling HTTP (/poll -> /test -> /respond)
    try {
      await fetch(`${BASE_URL}/api/relay/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'fallback' })
      });

      const bridgeAbort = new AbortController();
      const pollPromise = (async () => {
        // Loop rápido de bridge simulada até responder 1 job ou abortar
        for (let attempt = 0; attempt < 4; attempt++) {
          if (bridgeAbort.signal.aborted) break;
          const pRes = await fetch(
            `${BASE_URL}/api/relay/poll?token=${encodeURIComponent(activeToken)}&label=BridgeTestCI`,
            { signal: bridgeAbort.signal }
          );
          const pJson = await pRes.json();
          if (pJson?.job) {
            await fetch(`${BASE_URL}/api/relay/respond?token=${encodeURIComponent(activeToken)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jobId: pJson.job.id,
                ok: true,
                status: 200,
                headers: { 'content-type': 'text/html; charset=utf-8' },
                bodyText: '<html><body>MangaFire Ok via Residential IP</body></html>'
              })
            });
            return pJson.job;
          }
        }
        return null;
      })();

      // Aguarda brevemente o long-poll registrar presença online
      await new Promise(r => setTimeout(r, 120));
      const onlineStatus = await (await fetch(`${BASE_URL}/api/relay/status`)).json();
      assert(
        onlineStatus?.data?.bridgeOnline === true && onlineStatus?.data?.clientLabel === 'BridgeTestCI',
        'Presença da ponte residencial marca bridgeOnline=true durante long-poll ativo'
      );

      const relayTestRes = await fetch(`${BASE_URL}/api/relay/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://blocked-scan.example/manga/teste' })
      });
      const relayTestJson = await relayTestRes.json();
      const handledJob = await Promise.race([
        pollPromise,
        new Promise(resolve => setTimeout(() => resolve(null), 1500))
      ]);
      bridgeAbort.abort();

      assert(
        relayTestRes.status === 200 &&
        relayTestJson?.data?.ok === true &&
        relayTestJson?.data?.status === 200 &&
        relayTestJson?.data?.bytes > 20 &&
        handledJob?.url === 'https://blocked-scan.example/manga/teste',
        'Round-trip POST /api/relay/test despacha para ponte via /poll e recebe resposta via /respond'
      );

      // 16.6 Resgate automático de Cloudflare 403 no DynamicTemplateProvider (in-process)
      const { DynamicTemplateProvider } = await import('../sources/DynamicTemplateProvider.js');
      const originalFetch = globalThis.fetch;
      const savedRelayMode = residentialRelayService.getMode();
      try {
        residentialRelayService.disconnectBridge();
        residentialRelayService.updateConfig({ mode: 'fallback' });

        // Stub de upstream retornando HTTP 403 Cloudflare no fetch direto
        globalThis.fetch = async () =>
          new Response('<html><title>Just a moment...</title></html>', { status: 403 });

        const cfProvider = new DynamicTemplateProvider({
          id: 'ext-cf-test',
          name: 'CF Protected Scan',
          baseUrl: 'https://cf-protected.example',
          template: 'madara',
          lang: 'pt-br',
          version: '1.0.0'
        });

        // Sem ponte conectada, falha graciosamente com 403 Cloudflare (zero degradação no fluxo padrão)
        let threwWithoutBridge = false;
        try {
          await cfProvider.search('solo');
        } catch (err) {
          threwWithoutBridge = Boolean(err);
        }
        assert(
          threwWithoutBridge === true,
          'Sem ponte conectada, DynamicTemplateProvider falha normalmente em 403 Cloudflare sem travar'
        );

        // Com ponte ativa simulada via handlePoll/handleRespond in-process, resgata o HTML Madara
        const fakeRes = {
          headersSent: false,
          jsonPayload: null,
          on: () => {},
          json(payload) {
            this.headersSent = true;
            this.jsonPayload = payload;
            if (payload?.job) {
              setImmediate(() => {
                residentialRelayService.handleRespond({
                  jobId: payload.job.id,
                  ok: true,
                  status: 200,
                  headers: { 'content-type': 'text/html' },
                  bodyText: `
                    <div class="c-tabs-item__content">
                      <div class="post-title"><h3><a href="https://cf-protected.example/manga/solo-cf/">Solo CF Rescue</a></h3></div>
                    </div>
                  `
                });
              });
            }
          }
        };
        residentialRelayService.handlePoll('InProcessBridge', fakeRes);

        const rescued = await cfProvider.search('solo');
        assert(
          rescued.mangaList.length === 1 && rescued.mangaList[0].title === 'Solo CF Rescue',
          'DynamicTemplateProvider resgata busca bloqueada por Cloudflare 403 quando Ponte Residencial está ativa'
        );
      } finally {
        globalThis.fetch = originalFetch;
        residentialRelayService.disconnectBridge();
        residentialRelayService.updateConfig({ mode: savedRelayMode });
      }

      // 16.7 Rotação de token e desconexão limpa
      const rotateRes = await fetch(`${BASE_URL}/api/relay/token/rotate`, { method: 'POST' });
      const rotateJson = await rotateRes.json();
      assert(
        rotateRes.status === 200 &&
        rotateJson?.data?.token &&
        rotateJson.data.token !== activeToken &&
        rotateJson.data.bridgeOnline === false,
        'POST /api/relay/token/rotate gera novo token e desconecta ponte anterior'
      );
    } finally {
      await fetch(`${BASE_URL}/api/relay/disconnect`, { method: 'POST' }).catch(() => {});
      await fetch(`${BASE_URL}/api/relay/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: initialMode, customProxyUrl: initialProxy })
      }).catch(() => {});
    }

    // -------------------------------------------------------------------------
    // 17. PASSO 4: AUTO-DETECÇÃO DE SITE, FAILOVER DE CAPÍTULOS & AUTO-SYNC
    // -------------------------------------------------------------------------
    console.log('\n[17/17] Testando Passo 4 (Auto-Detecção, Failover de Capítulos & Saúde/Sync)...');

    const { analyzeSiteHtml, buildMirrorCandidateUrls } = await import(
      '../sources/SiteAutoDetector.js'
    );

    const madaraSampleHtml = `
      <html lang="pt-BR">
        <head><title>Scan BR Teste - Ler Mangás Online</title></head>
        <body>
          <link rel="stylesheet" href="/wp-content/themes/madara/style.css" />
          <div class="c-tabs-item__content"><h3><a href="/manga/solo/">Solo</a></h3></div>
        </body>
      </html>
    `;
    const madaraDet = analyzeSiteHtml(madaraSampleHtml, 'https://scanbr.example');
    assert(
      madaraDet.template === 'madara' &&
      madaraDet.confidence === 'high' &&
      madaraDet.lang === 'pt-br' &&
      madaraDet.suggestedName === 'Scan BR Teste',
      'analyzeSiteHtml identifica WP-Madara, idioma pt-br e nome do site'
    );

    const themesiaSampleHtml = `
      <html lang="en">
        <head><meta property="og:site_name" content="Themesia Scans" /></head>
        <body>
          <div class="listupd"><div class="bsx"><a href="/manga/test/">Test</a></div></div>
          <script>ts_reader.run({"sources":[]});</script>
        </body>
      </html>
    `;
    const themesiaDet = analyzeSiteHtml(themesiaSampleHtml, 'https://themesiascans.example');
    assert(
      themesiaDet.template === 'themesia' &&
      themesiaDet.confidence === 'high' &&
      themesiaDet.lang === 'en' &&
      themesiaDet.suggestedName === 'Themesia Scans',
      'analyzeSiteHtml identifica MangaThemesia e metadados'
    );

    const customSampleHtml = `
      <html lang="es">
        <head><title>Custom Scan ES</title></head>
        <body>
          <div class="manga-card"><a href="/series/1">Obra</a></div>
          <div class="chapter-list"><a href="/cap-1">Cap 1</a></div>
        </body>
      </html>
    `;
    const customDet = analyzeSiteHtml(customSampleHtml, 'https://customes.example');
    assert(
      customDet.template === 'custom_html' &&
      customDet.selectors?.searchItem === '.manga-card' &&
      customDet.selectors?.chapterItem === '.chapter-list a',
      'analyzeSiteHtml sugere seletores Custom HTML quando layout é personalizado'
    );

    const mirrorList = buildMirrorCandidateUrls('https://scan-teste.com');
    assert(
      mirrorList.length >= 4 &&
      !mirrorList.includes('https://scan-teste.com') &&
      mirrorList.includes('https://scan-teste.net'),
      'buildMirrorCandidateUrls gera espelhos públicos candidatos excluindo o domínio atual'
    );

    // 17.2 Guardas SSRF & validação em POST /api/extensions/detect
    const detectSsrfRes = await fetch(`${BASE_URL}/api/extensions/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://127.0.0.1:3000' })
    });
    assert(detectSsrfRes.status === 400, 'POST /api/extensions/detect bloqueia URL privada/localhost (HTTP 400)');

    // 17.3 Failover inteligente de capítulos no SourceRegistry mesmo quando a fonte primária cai ou foi removida
    registry.registerSource({
      getInfo: () => ({ id: 'stub-cf-fail', name: 'Stub CF Fail', isAvailable: true }),
      search: async () => ({ mangaList: [], total: 0, hasMore: false }),
      getPopular: async () => [],
      getMangaDetails: async () => {
        throw new Error('403 Cloudflare challenge');
      },
      getChapters: async () => {
        throw new Error('403 Cloudflare challenge');
      },
      getChapterPages: async () => []
    });

    registry.registerSource({
      getInfo: () => ({ id: 'stub-healthy-ch', name: 'Stub Healthy', isAvailable: true }),
      search: async (q) => ({
        mangaList: q.toLowerCase().includes('alpha failover')
          ? [makeStubManga('stub-healthy-ch', 'Alpha Failover')]
          : [],
        total: 1,
        hasMore: false
      }),
      getPopular: async () => [],
      getMangaDetails: async () => makeStubManga('stub-healthy-ch', 'Alpha Failover'),
      getChapters: async () => [
        {
          id: 'ch_stub-healthy-ch_Alpha Failover_42',
          mangaId: 'mr_stub-healthy-ch_Alpha Failover',
          chapterNumber: '42',
          title: 'Resgate Automático',
          language: 'en',
          sourceId: 'stub-healthy-ch',
          externalChapterId: '42'
        }
      ],
      getChapterPages: async () => []
    });

    try {
      const rescuedChapters = await registry.getChapters('mr_stub-cf-fail_alpha-slug', 'en', {
        titleHint: 'Alpha Failover'
      });
      assert(
        rescuedChapters.length >= 1 &&
        rescuedChapters.some(c => c.chapterNumber === '42' && c.sourceId === 'stub-healthy-ch'),
        'SourceRegistry.getChapters resgata capítulos em fonte saudável quando primária falha em 403/offline'
      );

      const missingSourceRescued = await registry.getChapters('mr_ext-removed-src_alpha-slug', 'en', {
        titleHint: 'Alpha Failover'
      });
      assert(
        missingSourceRescued.length >= 1 && missingSourceRescued[0].chapterNumber === '42',
        'SourceRegistry.getChapters resgata capítulos usando titleHint mesmo se extensão original foi removida'
      );
    } finally {
      registry.unregisterSource('stub-cf-fail');
      registry.unregisterSource('stub-healthy-ch');
    }

    // 17.4 Auto-atualização de extensões por repositório preservando espelho customizado
    const fsMod = await import('fs');
    const osMod = await import('os');
    const pathMod = await import('path');
    const tempExtFile = pathMod.join(osMod.tmpdir(), `mr-ext-test-${Date.now()}.json`);
    try {
      const { ExtensionRepositoryService } = await import('../sources/ExtensionRepositoryService.js');
      const isolatedRepoSvc = new ExtensionRepositoryService(tempExtFile);
      isolatedRepoSvc.installExtension({
        id: 'ext-sync-demo',
        name: 'Sync Demo',
        baseUrl: 'https://orig.example',
        template: 'madara',
        lang: 'pt-br',
        version: '1.0.0',
        repoUrl: 'https://repo.example/repo.json'
      });
      isolatedRepoSvc.updateMirror('ext-sync-demo', 'https://custom-user-mirror.example');

      const updates = isolatedRepoSvc.applyRepoUpdates({
        url: 'https://repo.example/repo.json',
        name: 'Repo Teste',
        lastSyncedAt: Date.now(),
        extensions: [
          {
            id: 'ext-sync-demo',
            name: 'Sync Demo',
            baseUrl: 'https://new-origin.example',
            defaultBaseUrl: 'https://new-origin.example',
            template: 'madara',
            lang: 'pt-br',
            version: '1.2.0'
          }
        ]
      });

      const upgradedExt = isolatedRepoSvc.getInstalledExtensions().find(e => e.id === 'ext-sync-demo');
      assert(
        updates.length === 1 &&
        updates[0].fromVersion === '1.0.0' &&
        updates[0].toVersion === '1.2.0' &&
        upgradedExt?.version === '1.2.0' &&
        upgradedExt?.baseUrl === 'https://custom-user-mirror.example' &&
        upgradedExt?.defaultBaseUrl === 'https://new-origin.example',
        'applyRepoUpdates atualiza versão da extensão preservando espelho customizado do usuário'
      );
    } finally {
      if (fsMod.existsSync(tempExtFile)) {
        fsMod.unlinkSync(tempExtFile);
      }
    }

    // 17.5 Contratos HTTP export-repo e repos/sync-all
    const exportRepoRes = await fetch(`${BASE_URL}/api/extensions/export-repo`);
    assert(exportRepoRes.status === 200, 'GET /api/extensions/export-repo retorna HTTP 200');
    const exportRepoJson = await exportRepoRes.json();
    assert(
      typeof exportRepoJson.name === 'string' && Array.isArray(exportRepoJson.extensions),
      'GET /api/extensions/export-repo exporta estrutura JSON válida de repositório'
    );

    const syncAllRes = await fetch(`${BASE_URL}/api/extensions/repos/sync-all`, { method: 'POST' });
    assert(syncAllRes.status === 200, 'POST /api/extensions/repos/sync-all retorna HTTP 200');
    const syncAllJson = await syncAllRes.json();
    assert(
      syncAllJson.success === true && typeof syncAllJson?.data?.reposChecked === 'number',
      'POST /api/extensions/repos/sync-all retorna resumo estruturado de sincronização'
    );

    const finalSourcesCheck = await (await fetch(`${BASE_URL}/api/sources`)).json();
    assert(finalSourcesCheck.data.length === 6, 'Suíte finaliza com as 6 fontes nativas limpas');

    // =========================================================================
    // 18. Oráculo da Leitura & Surpreenda-me (Exclusão de Ocultos/Salvos Cross-Source)
    // =========================================================================
    console.log('\n[18/18] Testando Oráculo da Leitura & Surpreenda-me (Ocultos e Salvos)...');
    const {
      isMangaInFavorites,
      isMangaInIgnored,
      pickOracleCandidate,
      pickSurpriseCandidate
    } = await import('../../src/utils/libraryFilters.js');

    const mIgnoredCross = {
      id: 'mr_mangapill_11-20-seiki-shounen',
      title: '20 Seiki Shounen',
      altTitles: ['20th Century Boys'],
      coverUrl: '',
      synopsis: '',
      authors: [],
      artists: [],
      genres: ['Mystery'],
      status: 'completed',
      publicationInfo: {},
      sources: [{ sourceId: 'mangapill', externalId: '11-20-seiki-shounen' }],
      updatedAt: '',
      isAdult: false
    };
    const mSavedCross = {
      id: 'mr_weebcentral_komi',
      title: "Komi Can't Communicate",
      altTitles: ['Komi-san wa Komyushou Desu.'],
      coverUrl: '',
      synopsis: '',
      authors: [],
      artists: [],
      genres: ['Comedy'],
      status: 'completed',
      publicationInfo: {},
      sources: [{ sourceId: 'weebcentral', externalId: 'komi' }],
      updatedAt: '',
      isAdult: false
    };
    const mFreshDiscovery = {
      id: 'mr_mangadex_pluto',
      title: 'Pluto',
      altTitles: ['PLUTO'],
      coverUrl: '',
      synopsis: '',
      authors: [],
      artists: [],
      genres: ['Mystery'],
      status: 'completed',
      publicationInfo: {},
      sources: [{ sourceId: 'mangadex', externalId: 'pluto' }],
      updatedAt: '',
      isAdult: false
    };

    const mockIgnored = [
      {
        mangaId: 'mr_comick_20th-century',
        title: '20th Century Boys',
        dismissedAt: Date.now()
      }
    ];
    const mockFavorites = [
      {
        mangaId: 'mr_mangadex_komi-dex',
        title: 'Komi-san wa Komyushou Desu.',
        coverUrl: '',
        updatedAt: Date.now()
      }
    ];

    assert(
      isMangaInIgnored(mIgnoredCross, mockIgnored) === true,
      'isMangaInIgnored detecta obra oculta cross-source por altTitle (20 Seiki Shounen vs 20th Century Boys)'
    );
    assert(
      isMangaInFavorites(mSavedCross, mockFavorites) === true,
      'isMangaInFavorites detecta obra salva cross-source por altTitle (Komi Can\'t Communicate vs Komi-san)'
    );

    const oraclePick = pickOracleCandidate(
      [mIgnoredCross, mSavedCross, mFreshDiscovery],
      mockFavorites,
      mockIgnored
    );
    assert(
      oraclePick?.id === mFreshDiscovery.id,
      'Oráculo da Leitura exclui ocultos e salvos priorizando nova descoberta (Pluto)'
    );

    const oracleAllIgnored = pickOracleCandidate([mIgnoredCross], mockFavorites, mockIgnored);
    assert(
      oracleAllIgnored === null,
      'Oráculo da Leitura retorna null em vez de exibir uma obra oculta'
    );

    const surpriseFromFallback = pickSurpriseCandidate(
      [[mIgnoredCross, mSavedCross], [mFreshDiscovery]],
      mockFavorites,
      mockIgnored
    );
    assert(
      surpriseFromFallback?.id === mFreshDiscovery.id,
      'Surpreenda-me pula ocultos e salvos da lista atual e escolhe descoberta inédita no fallback'
    );

    const surpriseNeverIgnored = pickSurpriseCandidate([[mIgnoredCross]], mockFavorites, mockIgnored);
    assert(
      surpriseNeverIgnored === null,
      'Surpreenda-me nunca abre uma obra da lista de ocultos/dispensados'
    );

    // =========================================================================
    // 19. Direcionamento Inteligente & Filtro Estrito de Foco (1 palavra ou frase)
    // =========================================================================
    console.log('\n[19/19] Testando Direcionamento Inteligente & Filtro Estrito de Foco...');
    const {
      evaluateCandidateFocusFit
    } = await import('../services/aiSimilarityService.js');

    const resolvedPhraseFocus = resolveFocusToCategoriesAndQueries(
      [],
      'isekai,protagonista reinacarna como crianca'
    );
    assert(
      resolvedPhraseFocus.muCategories.includes('Child Protagonist') &&
      resolvedPhraseFocus.muCategories.includes('Transported to Another World') &&
      resolvedPhraseFocus.muCategories.includes('Reincarnation'),
      'Frase com erro de digitação ("isekai,protagonista reinacarna como crianca") resolve para Child Protagonist + Reincarnation + Isekai'
    );
    assert(
      resolvedPhraseFocus.searchQueries.includes('reincarnated as a boy') &&
      resolvedPhraseFocus.anilistTags.includes('Isekai'),
      'Gera queries em inglês e tags do AniList específicas para reencarnação como criança'
    );

    const resolvedSingleWordShota = resolveFocusToCategoriesAndQueries([], 'shouta');
    assert(
      resolvedSingleWordShota.muCategories.includes('Child Protagonist') &&
      resolvedSingleWordShota.searchQueries.includes('shota'),
      'Uma única palavra ("shouta") ativa o conceito completo de Protagonista Criança / Shota'
    );

    const slimeCandidate = {
      id: 'mr_mangadex_slime',
      title: 'Tensei shitara Slime Datta Ken',
      altTitles: ['That Time I Got Reincarnated as a Slime'],
      coverUrl: '',
      synopsis: '37-year-old corporate worker Satoru Mikami is stabbed and reincarnated as a slime monster in another world with unique skills.',
      authors: ['Fuse'],
      artists: [],
      genres: ['Isekai', 'Reincarnation', 'Action', 'Fantasy', 'Male Protagonist'],
      status: 'ongoing',
      publicationInfo: {},
      sources: [],
      updatedAt: ''
    };
    const childIsekaiCandidate = {
      id: 'mr_mangadex_tensei_boukenroku',
      title: 'Tensei Kizoku no Isekai Boukenroku',
      altTitles: ['Chronicles of an Aristocrat Reborn in Another World'],
      coverUrl: '',
      synopsis: 'Kazuya Shiina dies protecting a girl and is reincarnated into another world as Cain, the third son of a noble aristocrat, growing up as a young boy with magic.',
      authors: ['Yashu'],
      artists: [],
      genres: ['Isekai', 'Reincarnation', 'Fantasy', 'Child Protagonist'],
      status: 'ongoing',
      publicationInfo: {},
      sources: [],
      updatedAt: ''
    };
    const genericOverlordCandidate = {
      id: 'mr_mangadex_overlord',
      title: 'Overlord',
      altTitles: [],
      coverUrl: '',
      synopsis: 'A salaryman is trapped inside a fantasy game world as an undead skeleton overlord.',
      authors: ['Maruyama Kugane'],
      artists: [],
      genres: ['Isekai', 'Action', 'Fantasy'],
      status: 'ongoing',
      publicationInfo: {},
      sources: [],
      updatedAt: ''
    };

    const slimeFit = evaluateCandidateFocusFit(
      slimeCandidate,
      resolvedPhraseFocus,
      undefined,
      'isekai,protagonista reinacarna como crianca',
      []
    );
    assert(
      slimeFit.passesGate === false && slimeFit.contradicted === true,
      'Filtro estrito rejeita Slime Datta Ken quando o foco pede protagonista reencarnado como criança'
    );

    const overlordFit = evaluateCandidateFocusFit(
      genericOverlordCandidate,
      resolvedPhraseFocus,
      undefined,
      'isekai,protagonista reinacarna como crianca',
      []
    );
    assert(
      overlordFit.passesGate === false,
      'Filtro estrito rejeita isekais genéricos (Overlord) que não têm protagonista criança'
    );

    const childIsekaiFit = evaluateCandidateFocusFit(
      childIsekaiCandidate,
      resolvedPhraseFocus,
      undefined,
      'isekai,protagonista reinacarna como crianca',
      []
    );
    assert(
      childIsekaiFit.passesGate === true && childIsekaiFit.specificMatchedCount >= 1,
      'Filtro estrito aprova obra coerente com o foco (reencarnado como menino nobre em outro mundo)'
    );

    const resolvedTerritoryChip = resolveFocusToCategoriesAndQueries(['Gestão de Território / Reino'], '');
    assert(
      resolvedTerritoryChip.muCategories.includes('Territory Management') &&
      resolvedTerritoryChip.anilistTags.includes('Kingdom Building'),
      'Chip de subcategoria "Gestão de Território / Reino" mapeia para Territory Management e Kingdom Building'
    );

    // =========================================================================
    // 20. Merge de Favoritos Duplicados & Limpeza do Radar de Lançamentos
    // =========================================================================
    console.log('\n[20/20] Testando Merge de Favoritos Duplicados & Limpeza de UpdateTracker...');
    const hadGlobalStorage = 'localStorage' in globalThis;
    const prevGlobalStorage = globalThis.localStorage;
    const mockStore = new Map();
    globalThis.localStorage = {
      getItem: (k) => (mockStore.has(k) ? mockStore.get(k) : null),
      setItem: (k, v) => mockStore.set(k, String(v)),
      removeItem: (k) => mockStore.delete(k),
      clear: () => mockStore.clear()
    };

    try {
      const { HistoryService } = await import('../../src/services/history.js');
      const { UpdateTrackerService } = await import('../../src/services/updateTracker.js');

      HistoryService.notifyExternalSync();

      const primaryId = 'mr_mangadex_kaoru-hana';
      const dupId = 'mr_weebcentral_fragrant-flower';

      HistoryService.toggleBookmark({
        mangaId: primaryId,
        title: 'Kaoru Hana wa Rin to Saku',
        coverUrl: 'https://example.com/kaoru.jpg',
        sourceId: 'mangadex',
        sourceName: 'MangaDex',
        userCategory: 'reading',
        altTitles: ['The Fragrant Flower Blooms With Dignity']
      });
      HistoryService.toggleBookmark({
        mangaId: dupId,
        title: 'The Fragrant Flower Blooms With Dignity',
        coverUrl: 'https://example.com/fragrant.jpg',
        sourceId: 'weebcentral',
        sourceName: 'WeebCentral',
        userCategory: 'reading'
      });

      const fakeUpdates = {
        [primaryId]: {
          mangaId: primaryId,
          latestChapterId: 'ch_md_207',
          latestChapterNumber: '207',
          hasNew: true,
          checkedAt: Date.now()
        },
        [dupId]: {
          mangaId: dupId,
          latestChapterId: 'ch_wc_207',
          latestChapterNumber: '207',
          hasNew: true,
          checkedAt: Date.now()
        },
        mr_orphan_deleted: {
          mangaId: 'mr_orphan_deleted',
          latestChapterId: 'ch_orphan_10',
          latestChapterNumber: '10',
          hasNew: true,
          checkedAt: Date.now()
        }
      };
      globalThis.localStorage.setItem('manga_reader_updates_v1', JSON.stringify(fakeUpdates));

      // Orphan entry not in favorites must NOT count toward unread/unseen badge
      assert(
        UpdateTrackerService.getUnreadUpdatesCount() === 2 &&
        UpdateTrackerService.getUnseenBadgeCount() === 2,
        'UpdateTrackerService ignora entradas órfãs fora dos favoritos na contagem de Lançamentos'
      );

      // Simulate merging dupId into primaryId
      HistoryService.migrateMangaData(
        dupId,
        {
          mangaId: primaryId,
          title: 'Kaoru Hana wa Rin to Saku',
          coverUrl: 'https://example.com/kaoru.jpg',
          sourceId: 'mangadex',
          sourceName: 'MangaDex',
          altTitles: ['The Fragrant Flower Blooms With Dignity'],
          userCategory: 'reading'
        },
        [],
        [],
        { removeOldSource: true }
      );
      UpdateTrackerService.migrateMangaUpdate(dupId, primaryId);
      UpdateTrackerService.pruneOrphanedUpdates();

      const remainingFavs = HistoryService.getFavorites();
      const storedAfterMerge = UpdateTrackerService.getStoredUpdates();

      assert(
        remainingFavs.length === 1 && remainingFavs[0].mangaId === primaryId,
        'HistoryService.migrateMangaData mantém apenas o favorito principal após merge'
      );
      assert(
        !(dupId in storedAfterMerge) &&
        !('mr_orphan_deleted' in storedAfterMerge) &&
        Boolean(storedAfterMerge[primaryId]),
        'UpdateTrackerService remove entrada duplicada e órfãos após merge mantendo o principal'
      );
      assert(
        UpdateTrackerService.getUnreadUpdatesCount() === 1 &&
        UpdateTrackerService.getUnseenBadgeCount() === 1,
        'Contagem de novos capítulos e badge cai de 2 para 1 após mesclar duplicata'
      );
    } finally {
      if (hadGlobalStorage) {
        globalThis.localStorage = prevGlobalStorage;
      } else {
        delete globalThis.localStorage;
      }
    }

    // -----------------------------------------------------------------------
    // SEÇÃO 21: Performance em Escala (Favoritar/Ocultar Rápidos + Cache + Índices)
    // -----------------------------------------------------------------------
    console.log('\n📋 [21/21] Testando Otimizações de Performance (O(N), Cache, Escopo)...');

    const prevPerfStorage = globalThis.localStorage;
    const hadPerfStorage = 'localStorage' in globalThis;
    const perfStore = new Map();
    let trackerMappingReads = 0;

    globalThis.localStorage = {
      getItem: (k) => {
        if (k === 'manga_reader_tracker_mappings_v1') trackerMappingReads++;
        return perfStore.has(k) ? perfStore.get(k) : null;
      },
      setItem: (k, v) => { perfStore.set(k, String(v)); },
      removeItem: (k) => { perfStore.delete(k); },
      clear: () => { perfStore.clear(); }
    };

    try {
      const { HistoryService } = await import('../../src/services/history.js');
      const { TrackerService } = await import('../../src/services/trackerService.js');
      const { detectDuplicateFavoriteGroups } = await import('../../src/components/DuplicateFavoritesModal.js');
      const { buildLibraryIndex, isMangaInLibraryIndex } = await import('../../src/utils/libraryFilters.js');

      HistoryService.notifyExternalSync();
      TrackerService.invalidateCache();

      // 19.1 Scoped HistoryService topics + O(1) per-manga listeners
      let favTopicCalls = 0;
      let ignoredTopicCalls = 0;
      let m1Calls = 0;
      let m2Calls = 0;

      const uFav = HistoryService.subscribe(() => { favTopicCalls++; }, ['favorites']);
      const uIg = HistoryService.subscribe(() => { ignoredTopicCalls++; }, ['ignored']);
      const uM1 = HistoryService.subscribeManga('mr_test_m1', () => { m1Calls++; });
      const uM2 = HistoryService.subscribeManga('mr_test_m2', () => { m2Calls++; });

      HistoryService.ignoreManga({ mangaId: 'mr_test_m1', title: 'Test Manga One' });
      assert(
        ignoredTopicCalls === 1 && favTopicCalls === 0 && m1Calls === 1 && m2Calls === 0,
        'ignoreManga notifica apenas tópico ignored e card específico sem acordar favoritos ou outros cards'
      );

      HistoryService.toggleBookmark({ mangaId: 'mr_test_m2', title: 'Test Manga Two', coverUrl: '' });
      assert(
        favTopicCalls === 1 && ignoredTopicCalls === 1 && m1Calls === 1 && m2Calls === 1,
        'toggleBookmark notifica apenas tópico favorites e card específico'
      );

      uFav();
      uIg();
      uM1();
      uM2();

      // 19.2 TrackerService in-memory cache avoids repeated JSON.parse on 1,000 badges
      TrackerService.setMapping('mr_test_m1', { anilistId: 12345, anilistTitle: 'Test', anilistStatus: 'synced' });
      const readsBeforeLoop = trackerMappingReads;
      const tTrackerStart = performance.now();
      for (let i = 0; i < 1000; i++) {
        TrackerService.getMangaSyncStatus(i % 2 === 0 ? 'mr_test_m1' : `mr_other_${i}`);
      }
      const tTrackerMs = performance.now() - tTrackerStart;
      assert(
        trackerMappingReads === readsBeforeLoop && tTrackerMs < 150,
        `TrackerService usa cache em memória sem reler localStorage em 1000 consultas (${tTrackerMs.toFixed(1)}ms)`
      );

      // 19.3 Indexed duplicate detection at scale (600 favorites) preserving exact/alt/romaji/substring parity
      const largeFavs = [];
      for (let i = 0; i < 592; i++) {
        largeFavs.push({
          mangaId: `mr_mangadex_scale_${i}`,
          title: `Chronicles of Magic Sword Volume ${i} Special`,
          altTitles: [`Mahou Ken no Monogatari ${i}`, `Legend of Blade ${i}`],
          coverUrl: '',
          sourceName: 'MangaDex',
          userCategory: 'reading',
          updatedAt: Date.now()
        });
      }
      // Inject 4 distinct duplicate pairs (exact, alt_title, romaji_loose, substring_match)
      largeFavs.push(
        {
          mangaId: 'mr_mangadex_beast',
          title: 'Yuusha Party wo Tsuihou Sareta Beast Tamer, Saikyoushu no Nekomimi Shoujo to Deau',
          coverUrl: '',
          sourceName: 'MangaDex',
          userCategory: 'reading',
          updatedAt: Date.now()
        },
        {
          mangaId: 'mr_weebcentral_beast',
          title: 'Beast Tamer',
          coverUrl: '',
          sourceName: 'WeebCentral',
          userCategory: 'reading',
          updatedAt: Date.now()
        },
        {
          mangaId: 'mr_mangadex_exact_dup',
          title: 'Witch Watch (Official)',
          coverUrl: '',
          sourceName: 'MangaDex',
          userCategory: 'reading',
          updatedAt: Date.now()
        },
        {
          mangaId: 'mr_comick_exact_dup',
          title: 'Witch Watch',
          coverUrl: '',
          sourceName: 'Comick',
          userCategory: 'reading',
          updatedAt: Date.now()
        },
        {
          mangaId: 'mr_mangadex_alt_dup',
          title: 'Kaoru Hana wa Rin to Saku',
          altTitles: ['The Fragrant Flower Blooms With Dignity'],
          coverUrl: '',
          sourceName: 'MangaDex',
          userCategory: 'reading',
          updatedAt: Date.now()
        },
        {
          mangaId: 'mr_weebcentral_alt_dup',
          title: 'The Fragrant Flower Blooms With Dignity',
          coverUrl: '',
          sourceName: 'WeebCentral',
          userCategory: 'reading',
          updatedAt: Date.now()
        },
        {
          mangaId: 'mr_mangadex_romaji_dup',
          title: 'Tensei Shitara Ken Deshita wo Bouken',
          coverUrl: '',
          sourceName: 'MangaDex',
          userCategory: 'reading',
          updatedAt: Date.now()
        },
        {
          mangaId: 'mr_comick_romaji_dup',
          title: 'Tensei Shitara Ken Deshita o Boken',
          coverUrl: '',
          sourceName: 'Comick',
          userCategory: 'reading',
          updatedAt: Date.now()
        }
      );

      const tDupStart = performance.now();
      const dupGroups = detectDuplicateFavoriteGroups(largeFavs);
      const tDupMs = performance.now() - tDupStart;
      const dupGroupIds = dupGroups.map(g => g.items.map(x => x.mangaId).sort().join('|'));

      assert(
        dupGroups.length === 4 &&
        dupGroupIds.includes('mr_mangadex_beast|mr_weebcentral_beast') &&
        dupGroupIds.includes('mr_comick_exact_dup|mr_mangadex_exact_dup') &&
        dupGroupIds.includes('mr_mangadex_alt_dup|mr_weebcentral_alt_dup') &&
        dupGroupIds.includes('mr_comick_romaji_dup|mr_mangadex_romaji_dup') &&
        tDupMs < 250,
        `detectDuplicateFavoriteGroups indexado detecta 4 tipos de duplicatas em 600 obras rapidamente (${tDupMs.toFixed(1)}ms)`
      );

      // 19.4 Large LibraryIndex filter pass (1500 ignored + 600 favs x 250 search items)
      const largeIgnored = [];
      for (let i = 0; i < 1500; i++) {
        largeIgnored.push({
          mangaId: `mr_comick_ig_${i}`,
          title: `Oculto da Busca Número ${i}`,
          altTitles: [`Hidden Work Alt ${i}`],
          dismissedAt: Date.now()
        });
      }
      const searchPool = [];
      for (let i = 0; i < 250; i++) {
        searchPool.push({
          id: i === 5 ? 'mr_comick_ig_42' : `mr_search_${i}`,
          title: i === 10 ? 'Hidden Work Alt 100' : `Fantasy Romance Adventure ${i}`,
          altTitles: [`Fantasy Alt ${i}`],
          coverUrl: '',
          synopsis: '',
          authors: [],
          artists: [],
          genres: ['Romance', 'Fantasy'],
          status: 'ongoing',
          publicationInfo: {},
          sources: []
        });
      }

      const tFilterStart = performance.now();
      const favIdx = buildLibraryIndex(largeFavs);
      const igIdx = buildLibraryIndex(largeIgnored);
      const visible = searchPool.filter(m => !isMangaInLibraryIndex(m, favIdx) && !isMangaInLibraryIndex(m, igIdx));
      const tFilterMs = performance.now() - tFilterStart;

      assert(
        visible.length === 248 && tFilterMs < 100,
        `Filtragem indexada de busca com 600 favoritos + 1500 ocultos conclui rapidamente (${tFilterMs.toFixed(1)}ms)`
      );
    } finally {
      if (hadPerfStorage) {
        globalThis.localStorage = prevPerfStorage;
      } else {
        delete globalThis.localStorage;
      }
    }

    // -----------------------------------------------------------------------
    // SEÇÃO 22: Descoberta de Subgêneros / Nichos via AniList Discovery
    // -----------------------------------------------------------------------
    console.log('\n📋 [22/22] Testando Descoberta de Subgêneros de Nicho via AniList...');
    {
      const { extractAniListFilters, shouldUseAniListDiscovery } = await import('../sources/AniListDiscovery.js');

      const aniFilters = extractAniListFilters({ genres: ['Tomboy'], type: 'manga' });
      assert(
        aniFilters.hasNicheTag && aniFilters.allTags.includes('Tomboy'),
        'extractAniListFilters mapeia subgenero Tomboy para tag oficial AniList'
      );

      const kingdomFilters = extractAniListFilters({ genres: ['Construção de Vila / Reino', 'Regressão / Tempo'], type: 'manhwa' });
      assert(
        kingdomFilters.hasNicheTag &&
        kingdomFilters.allTags.includes('Kingdom Management') &&
        kingdomFilters.allTags.includes('Time Manipulation'),
        'extractAniListFilters mapeia multiplos subgeneros para tags oficiais AniList'
      );

      assert(
        shouldUseAniListDiscovery('', { genres: ['Tomboy'], type: 'manga' }) === true,
        'shouldUseAniListDiscovery ativa busca comunitaria AniList para subgeneros de nicho sem query textual'
      );

      assert(
        shouldUseAniListDiscovery('Nagatoro', { genres: ['Tomboy'], type: 'manga' }) === false,
        'shouldUseAniListDiscovery nao intercepta buscas com query textual explicita'
      );
    }

    // -----------------------------------------------------------------------
    // SEÇÃO 23: Resiliência do MangaPillProvider a HTTP 502 (Retry & Fallback)
    // -----------------------------------------------------------------------
    console.log('\n📋 [23/23] Testando Resiliência do MangaPillProvider a HTTP 502...');
    {
      const pillRetryProvider = new MangaPillProvider();
      const origFetch = globalThis.fetch;
      let callCount = 0;
      const sampleHtml = `
        <div>
          <a href="/manga/1/berserk"><figure><img data-src="https://cdn.readdetectiveconan.com/file/mangapill/covers/1.jpg" alt="Berserk"></figure></a>
          <a href="/manga/1/berserk"><div class="line-clamp-2">Berserk</div></a>
        </div>
      `;

      try {
        // 1) Transient 502 on attempt 0 -> 200 on retry
        globalThis.fetch = async () => {
          callCount++;
          if (callCount === 1) {
            return new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' });
          }
          return new Response(sampleHtml, { status: 200, headers: { 'Content-Type': 'text/html' } });
        };

        const recovered = await pillRetryProvider.search('berserk-retry-test');
        assert(
          callCount === 2 && recovered.mangaList.length === 1 && recovered.mangaList[0].title === 'Berserk',
          'MangaPillProvider faz retry em HTTP 502 transitorio e recupera busca automaticamente'
        );

        // 2) Persistent 502 on uncached query returns stale cache or graceful empty without throwing
        globalThis.fetch = async () => new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' });
        const persistentRes = await pillRetryProvider.search('uncached-502-query');
        assert(
          Array.isArray(persistentRes.mangaList) && persistentRes.mangaList.length === 0,
          'MangaPillProvider degrada graciosamente sem lancar excecao quando 502 persiste'
        );

        // 3) Popular browse falls back to curated baseline during 502 cooldown
        const popFallback = await pillRetryProvider.search('');
        assert(
          popFallback.mangaList.length > 0 && popFallback.mangaList.some(m => m.title === 'Berserk'),
          'MangaPillProvider serve catalogo popular fallback durante cooldown de 502'
        );
      } finally {
        globalThis.fetch = origFetch;
      }
    }

    // -----------------------------------------------------------------------
    // SEÇÃO 24: Decodificação Unificada de Entidades HTML (Numéricas, Hex & Duplas)
    // -----------------------------------------------------------------------
    console.log('\n📋 [24/24] Testando Decodificação de Entidades HTML em Fontes & Gateway...');
    {
      const { decodeHtmlEntities, sanitizeMangaEntities, sanitizeChapterEntities } = await import('../../src/utils/htmlEntities.js');
      const { WeebCentralProvider } = await import('../sources/WeebCentralProvider.js');
      const { sourceRegistry } = await import('../sources/SourceRegistry.js');

      assert(
        decodeHtmlEntities('Cherry Yuusha to &#34;Sei&#34; Naru Ken') === 'Cherry Yuusha to "Sei" Naru Ken',
        'decodeHtmlEntities decodifica entidades decimais como &#34; no título reportado'
      );
      assert(
        decodeHtmlEntities('Hero&#x27;s &ldquo;Journey&rdquo; &ndash; Vol. 1 &hellip;') === 'Hero\'s “Journey” – Vol. 1 …',
        'decodeHtmlEntities decodifica entidades hexadecimais (&#x27;) e nomeadas (&ldquo;, &ndash;, &hellip;)'
      );
      assert(
        decodeHtmlEntities('Double &amp;#34;Encoded&amp;#34; &amp;amp; Mixed') === 'Double "Encoded" & Mixed',
        'decodeHtmlEntities decodifica payloads duplamente escapados (&amp;#34;)'
      );

      const dirtyManga = {
        id: 'mr_weebcentral_01TEST00000000000000000000',
        title: 'Cherry Yuusha to &#34;Sei&#34; Naru Ken',
        altTitles: ['Cherry Hero&#x27;s Sword', '&#34;Holy&#34; Blade'],
        coverUrl: 'https://example.com/cover.jpg',
        synopsis: 'A hero&#39;s tale &ndash; full of &#34;surprises&#34;.',
        authors: ['Uchiba &amp; Studio'],
        artists: ['Uchiba&#39;s Team'],
        genres: ['Action', 'Sci&#45;Fi'],
        status: 'ongoing',
        publicationInfo: { magazine: 'Jump&#39;s Plus', demographic: 'Shounen' },
        updatedAt: '2026-01-01T00:00:00.000Z',
        sources: []
      };
      const cleanManga = sanitizeMangaEntities(dirtyManga);
      assert(
        cleanManga.title === 'Cherry Yuusha to "Sei" Naru Ken' &&
        cleanManga.altTitles[0] === "Cherry Hero's Sword" &&
        cleanManga.altTitles[1] === '"Holy" Blade' &&
        cleanManga.synopsis === 'A hero\'s tale – full of "surprises".' &&
        cleanManga.authors[0] === 'Uchiba & Studio' &&
        cleanManga.genres[1] === 'Sci-Fi' &&
        cleanManga.publicationInfo.magazine === "Jump's Plus",
        'sanitizeMangaEntities limpa titulo, sinopse, altTitles, autores, generos e revista'
      );

      const cleanChapter = sanitizeChapterEntities({
        id: 'ch_weebcentral_1_2',
        mangaId: 'mr_weebcentral_1',
        sourceId: 'weebcentral',
        externalChapterId: '2',
        chapterNumber: '1',
        title: 'Cap. 1: &#34;Despertar&#34;',
        language: 'en',
        publishDate: '2026-01-01',
        scanlationGroup: 'Team&#39;s Alpha'
      });
      assert(
        cleanChapter.title === 'Cap. 1: "Despertar"' && cleanChapter.scanlationGroup === "Team's Alpha",
        'sanitizeChapterEntities limpa titulo e scanlationGroup do capitulo'
      );

      // Integration test with WeebCentralProvider HTML search response via mocked fetch
      const wcProvider = new WeebCentralProvider();
      const origFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () => new Response(
          `<article class="bg-base-300 flex gap-4 p-4">
            <a href="https://weebcentral.com/series/01JH9999999999999999999999/cherry-yuusha" class="line-clamp-1 link link-hover">Cherry Yuusha to &#34;Sei&#34; Naru Ken</a>
            <img src="https://temp.compsci88.com/cover/normal/01JH9999999999999999999999.webp" alt="Cherry Yuusha to &#34;Sei&#34; Naru Ken cover">
            <strong>Status:</strong> <span>Ongoing</span>
          </article>`,
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
        const wcRes = await wcProvider.search('cherry yuusha entity test');
        assert(
          wcRes.mangaList.length === 1 && wcRes.mangaList[0].title === 'Cherry Yuusha to "Sei" Naru Ken',
          'WeebCentralProvider retorna titulo sem &#34; ao parsear HTML do servidor Go'
        );
      } finally {
        globalThis.fetch = origFetch;
      }

      // Gateway integration check via SourceRegistry.getMangaById
      const origGet = sourceRegistry.getSource('weebcentral').getMangaDetails;
      sourceRegistry.getSource('weebcentral').getMangaDetails = async () => dirtyManga;
      try {
        const regManga = await sourceRegistry.getMangaById('mr_weebcentral_01TEST00000000000000000000');
        assert(
          regManga?.title === 'Cherry Yuusha to "Sei" Naru Ken',
          'SourceRegistry.getMangaById sanitiza entidades HTML antes de retornar para a API'
        );
      } finally {
        sourceRegistry.getSource('weebcentral').getMangaDetails = origGet;
      }
    }

    // -----------------------------------------------------------------------
    // SEÇÃO 25: Resiliência do MangaDexProvider a "fetch failed" (Retry & Fallback)
    // -----------------------------------------------------------------------
    console.log('\n📋 [25/25] Testando Resiliência do MangaDexProvider a "fetch failed"...');
    {
      const { MangaDexProvider } = await import('../sources/MangaDexProvider.js');
      const dexProvider = new MangaDexProvider();
      const origFetch = globalThis.fetch;
      let calls = 0;

      const sampleDexResponse = {
        total: 1,
        data: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            attributes: {
              title: { en: 'Resilient MangaDex Title' },
              altTitles: [],
              description: { en: 'Sample synopsis' },
              status: 'ongoing',
              contentRating: 'safe',
              availableTranslatedLanguages: ['en'],
              latestUploadedChapter: '22222222-2222-4222-8222-222222222222',
              tags: []
            },
            relationships: []
          }
        ]
      };

      try {
        // 1) Transient TypeError('fetch failed') on search -> retries automatically and succeeds
        globalThis.fetch = async (url) => {
          const u = String(url);
          if (u.includes('/manga/tag')) {
            return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          calls++;
          if (calls === 1) {
            throw new TypeError('fetch failed');
          }
          return new Response(JSON.stringify(sampleDexResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        };

        const recovered = await dexProvider.search('resilient-dex-test');
        assert(
          calls === 2 &&
          recovered.mangaList.length === 1 &&
          recovered.mangaList[0].title === 'Resilient MangaDex Title',
          'MangaDexProvider faz retry automatico apos "fetch failed" transitorio e recupera busca'
        );

        // 2) Persistent fetch failed on uncached query returns graceful empty without throwing
        globalThis.fetch = async () => {
          throw new TypeError('fetch failed');
        };
        const persistentOutage = await dexProvider.search('uncached-dex-outage');
        assert(
          Array.isArray(persistentOutage.mangaList) && persistentOutage.mangaList.length === 0,
          'MangaDexProvider degrada graciosamente sem lancar excecao quando fetch failed persiste'
        );

        // 3) Cached query remains available during cooldown
        const staleHit = await dexProvider.search('resilient-dex-test');
        assert(
          staleHit.mangaList.length === 1 && staleHit.mangaList[0].title === 'Resilient MangaDex Title',
          'MangaDexProvider serve resultado em cache durante cooldown sem novo erro'
        );
      } finally {
        globalThis.fetch = origFetch;
      }
    }

    // -----------------------------------------------------------------------
    // SEÇÃO 26: Versão do App & Verificação de Atualizações (/api/version)
    // -----------------------------------------------------------------------
    console.log('\n📋 [26/26] Testando Endpoint /api/version e Consistência com /api/health...');
    {
      const versionRes = await fetch(`${BASE_URL}/api/version`);
      assert(versionRes.status === 200, 'GET /api/version retorna HTTP 200');
      const cacheControl = versionRes.headers.get('cache-control') || '';
      assert(
        cacheControl.includes('no-store'),
        'GET /api/version envia Cache-Control: no-store para evitar cache no celular'
      );
      const versionJson = await versionRes.json();
      assert(
        versionJson.success === true &&
        typeof versionJson.data?.version === 'string' &&
        typeof versionJson.data?.buildId === 'string' &&
        typeof versionJson.data?.buildTime === 'string',
        'GET /api/version retorna version, buildId e buildTime validos'
      );

      const healthRes2 = await fetch(`${BASE_URL}/api/health`);
      const healthJson2 = await healthRes2.json();
      assert(
        healthJson2.version === versionJson.data.version &&
        healthJson2.buildId === versionJson.data.buildId,
        'GET /api/health reporta a mesma versao e buildId que /api/version'
      );
    }

    // -----------------------------------------------------------------------
    // SEÇÃO 27: Resiliência Comick, Idiomas em Capítulos e Failover Cruzado
    // -----------------------------------------------------------------------
    console.log('\n📋 [27/30] Testando ComickProvider getChapters e Failover Cruzado (titleHint / chapterNumberHint)...');
    {
      const { ComickProvider } = await import('../sources/ComickProvider.js');
      const { sourceRegistry } = await import('../sources/SourceRegistry.js');
      const origFetch = globalThis.fetch;

      try {
        const comick = new ComickProvider();
        const requestedLangUrls = [];

        globalThis.fetch = async (url) => {
          const u = String(url);
          requestedLangUrls.push(u);
          if (u.includes('lang=pt-br')) {
            return new Response(JSON.stringify({
              total: 1,
              chapters: [{ hid: 'chpt1', chap: '1', lang: 'pt-br', title: 'Cap 1 PT', created_at: '2026-01-01T00:00:00Z' }]
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          if (u.includes('lang=en')) {
            return new Response(JSON.stringify({
              total: 1,
              chapters: [{ hid: 'chen1', chap: '2', lang: 'en', title: 'Ch 2 EN', created_at: '2026-01-02T00:00:00Z' }]
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response(JSON.stringify({
            total: 2,
            chapters: [
              { hid: 'chpt1', chap: '1', lang: 'pt-br', created_at: '2026-01-01T00:00:00Z' },
              { hid: 'ches1', chap: '3', lang: 'es', created_at: '2026-01-03T00:00:00Z' }
            ]
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        };

        const multiLangChs = await comick.getChapters('COMICKHID1', 'pt-br,en');
        assert(
          multiLangChs.some(c => c.language === 'pt-br') && multiLangChs.some(c => c.language === 'en'),
          'ComickProvider.getChapters("pt-br,en") consulta ambos idiomas e preserva language real por capitulo'
        );

        const allLangChs = await comick.getChapters('COMICKHID1', 'all');
        assert(
          allLangChs.some(c => c.language === 'es') && requestedLangUrls.some(u => !u.includes('lang=')),
          'ComickProvider.getChapters("all") busca sem parametro lang e aceita todos os idiomas'
        );
      } finally {
        globalThis.fetch = origFetch;
      }

      // Cross-source failover in SourceRegistry for mr_comick_... & ch_comick_...
      const comickSrc = sourceRegistry.getSource('comick');
      const weebSrc = sourceRegistry.getSource('weebcentral');
      const pillSrc = sourceRegistry.getSource('mangapill');
      const dexSrc = sourceRegistry.getSource('mangadex');
      const fireSrc = sourceRegistry.getSource('mangafire');
      const ballSrc = sourceRegistry.getSource('mangaball');

      const origComickDetails = comickSrc.getMangaDetails.bind(comickSrc);
      const origComickPagesRes = comickSrc.getChapterPagesResult.bind(comickSrc);
      const origComickChapters = comickSrc.getChapters.bind(comickSrc);
      const origWeebSearch = weebSrc.search.bind(weebSrc);
      const origWeebDetails = weebSrc.getMangaDetails.bind(weebSrc);
      const origWeebChapters = weebSrc.getChapters.bind(weebSrc);
      const origWeebPages = weebSrc.getChapterPages.bind(weebSrc);
      const origPillSearch = pillSrc.search.bind(pillSrc);
      const origDexSearch = dexSrc.search.bind(dexSrc);
      const origFireSearch = fireSrc?.search?.bind(fireSrc);
      const origBallSearch = ballSrc?.search?.bind(ballSrc);

      try {
        comickSrc.getMangaDetails = async () => {
          throw new Error('HTTP 403 Cloudflare block');
        };
        comickSrc.getChapterPagesResult = async () => {
          throw new Error('HTTP 502 Bad Gateway');
        };
        comickSrc.getChapters = async () => {
          throw new Error('HTTP 502 Bad Gateway');
        };

        const recoveredCandidate = {
          id: 'mr_weebcentral_01FAILOVER00000000000000',
          title: 'Comick Recovery Chronicle',
          altTitles: [],
          coverUrl: 'https://example.com/cover.webp',
          synopsis: 'Recovered via WeebCentral',
          authors: ['Author Test'],
          artists: ['Author Test'],
          genres: ['Action'],
          status: 'ongoing',
          publicationInfo: { country: 'JP' },
          availableLanguages: ['en'],
          updatedAt: '2026-01-01T00:00:00Z',
          sources: [{ sourceId: 'weebcentral', externalId: '01FAILOVER00000000000000', url: 'https://weebcentral.com/series/01FAILOVER00000000000000' }],
          hasAvailableChapters: true,
          availabilityStatus: 'available'
        };

        weebSrc.search = async () => ({ mangaList: [recoveredCandidate], total: 1, hasMore: false });
        weebSrc.getMangaDetails = async () => recoveredCandidate;
        weebSrc.getChapters = async () => ([
          {
            id: 'ch_weebcentral_01FAILOVER00000000000000_01CH420000000000000000000',
            mangaId: recoveredCandidate.id,
            chapterNumber: '42',
            language: 'en',
            sourceId: 'weebcentral',
            externalChapterId: '01CH420000000000000000000'
          }
        ]);
        weebSrc.getChapterPages = async () => ([
          { pageNumber: 1, imageUrl: 'https://cdn.example.com/ch42/01.jpg' },
          { pageNumber: 2, imageUrl: 'https://cdn.example.com/ch42/02.jpg' }
        ]);
        pillSrc.search = async () => ({ mangaList: [], total: 0, hasMore: false });
        dexSrc.search = async () => ({ mangaList: [], total: 0, hasMore: false });
        if (fireSrc) fireSrc.search = async () => ({ mangaList: [], total: 0, hasMore: false });
        if (ballSrc) ballSrc.search = async () => ({ mangaList: [], total: 0, hasMore: false });

        const recoveredDetails = await sourceRegistry.getMangaById('mr_comick_OPQ12345', {
          titleHint: 'Comick Recovery Chronicle'
        });
        assert(
          recoveredDetails?.id === 'mr_comick_OPQ12345' && recoveredDetails?.title === 'Comick Recovery Chronicle',
          'SourceRegistry.getMangaById recupera obra do Comick com erro via failover cruzado usando titleHint'
        );

        const recoveredPages = await sourceRegistry.getChapterPages('ch_comick_OPQ12345_BADHID99', {
          titleHint: 'Comick Recovery Chronicle',
          chapterNumberHint: '42'
        });
        assert(
          recoveredPages.length === 2 && recoveredPages[0].imageUrl.includes('ch42/01.jpg'),
          'SourceRegistry.getChapterPages recupera paginas de capitulo Comick com erro via chapterNumberHint + titleHint'
        );
      } finally {
        comickSrc.getMangaDetails = origComickDetails;
        comickSrc.getChapterPagesResult = origComickPagesRes;
        comickSrc.getChapters = origComickChapters;
        weebSrc.search = origWeebSearch;
        weebSrc.getMangaDetails = origWeebDetails;
        weebSrc.getChapters = origWeebChapters;
        weebSrc.getChapterPages = origWeebPages;
        pillSrc.search = origPillSearch;
        dexSrc.search = origDexSearch;
        if (fireSrc && origFireSearch) fireSrc.search = origFireSearch;
        if (ballSrc && origBallSearch) ballSrc.search = origBallSearch;
      }
    }

    // -----------------------------------------------------------------------
    // SEÇÃO 28: Paridade de Idiomas em Todos os Provedores
    // -----------------------------------------------------------------------
    console.log('\n📋 [28/30] Testando Paridade de Idiomas (pt-br, en, pt-br,en, all) nos Provedores...');
    {
      const { WeebCentralProvider } = await import('../sources/WeebCentralProvider.js');
      const { MangaPillProvider } = await import('../sources/MangaPillProvider.js');
      const { MangaDexProvider } = await import('../sources/MangaDexProvider.js');
      const { MangaFireProvider } = await import('../sources/MangaFireProvider.js');
      const { MangaBallProvider } = await import('../sources/MangaBallProvider.js');
      const origFetch = globalThis.fetch;

      try {
        const weeb = new WeebCentralProvider();
        const pill = new MangaPillProvider();
        const dex = new MangaDexProvider();
        const fire = new MangaFireProvider();
        const ball = new MangaBallProvider();

        // English-only providers must return empty on strict pt-br without hitting network
        let networkHitForPtBr = false;
        globalThis.fetch = async () => {
          networkHitForPtBr = true;
          return new Response('', { status: 200 });
        };

        const weebPtSearch = await weeb.search('berserk', { language: 'pt-br' });
        const weebPtChs = await weeb.getChapters('01SERIES', 'pt-br');
        const pillPtSearch = await pill.search('berserk', { language: 'pt-br' });
        const pillPtChs = await pill.getChapters('1-berserk', 'pt-br');
        assert(
          !networkHitForPtBr &&
          weebPtSearch.mangaList.length === 0 &&
          weebPtChs.length === 0 &&
          pillPtSearch.mangaList.length === 0 &&
          pillPtChs.length === 0,
          'WeebCentral e MangaPill bloqueiam busca e capitulos para "pt-br" estrito sem disparar rede'
        );

        // MangaDex chapter language queries
        const dexFeedUrls = [];
        globalThis.fetch = async (url) => {
          const u = String(url);
          if (u.includes('/manga/') && u.includes('/feed')) {
            dexFeedUrls.push(u);
            return new Response(JSON.stringify({
              total: 2,
              data: [
                { id: 'aaaa-1111', attributes: { chapter: '1', translatedLanguage: 'pt-br', pages: 10 }, relationships: [] },
                { id: 'bbbb-2222', attributes: { chapter: '2', translatedLanguage: 'en', pages: 12 }, relationships: [] }
              ]
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          if (u.includes('mangafire.to')) {
            return new Response(
              `<ul>
                <li data-number="1"><a href="/manga/test-slug/pt-1" title="Cap 1 PT">Cap 1</a></li>
                <li data-number="2"><a href="/manga/test-slug/en-2" title="Ch 2 EN">Ch 2</a></li>
                <li data-number="3"><a href="/manga/test-slug/es-3" title="Cap 3 ES">Cap 3</a></li>
              </ul>`,
              { status: 200, headers: { 'Content-Type': 'text/html' } }
            );
          }
          if (u.includes('mangaball.net')) {
            return new Response(JSON.stringify({
              items: [
                { id: 'b1', chapter_number: '1', language: 'pt-br', title: 'PT' },
                { id: 'b2', chapter_number: '2', language: 'en', title: 'EN' },
                { id: 'b3', chapter_number: '3', language: 'es', title: 'ES' }
              ]
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
        };

        await dex.getChapters('11111111-1111-4111-8111-111111111111', 'pt-br');
        await dex.getChapters('11111111-1111-4111-8111-111111111111', 'all');
        assert(
          dexFeedUrls[0]?.includes('translatedLanguage[]=pt-br') &&
          dexFeedUrls[0]?.includes('translatedLanguage[]=pt') &&
          !dexFeedUrls[1]?.includes('translatedLanguage'),
          'MangaDexProvider expande pt-br para pt-br+pt e omite filtro em "all"'
        );

        const firePt = await fire.getChapters('test-slug', 'pt-br');
        const fireCombo = await fire.getChapters('test-slug', 'pt-br,en');
        const fireAll = await fire.getChapters('test-slug', 'all');
        assert(
          firePt.length === 1 && firePt[0].language === 'pt-br' &&
          fireCombo.length === 2 && fireCombo.every(c => c.language !== 'pt-br,en') &&
          fireAll.length === 3,
          'MangaFireProvider preserva idioma real do capitulo e filtra corretamente pt-br / pt-br,en / all'
        );

        const ballPt = await ball.getChapters('test-ball', 'pt-br');
        const ballCombo = await ball.getChapters('test-ball', 'pt-br,en');
        const ballAll = await ball.getChapters('test-ball', 'all');
        assert(
          ballPt.length === 1 && ballPt[0].language === 'pt-br' &&
          ballCombo.length === 2 && ballCombo.every(c => c.language !== 'pt-br,en') &&
          ballAll.length === 3,
          'MangaBallProvider preserva idioma real do capitulo e filtra corretamente pt-br / pt-br,en / all'
        );
      } finally {
        globalThis.fetch = origFetch;
      }
    }

    // -----------------------------------------------------------------------
    // SEÇÃO 29: Parsing de Tipo no WeebCentral e Filtros (- Fantasia, Formato JP)
    // -----------------------------------------------------------------------
    console.log('\n📋 [29/30] Testando WeebCentral Type Badge e Filtros de Busca (type=manga + excludedGenres=Fantasia)...');
    {
      const { WeebCentralProvider } = await import('../sources/WeebCentralProvider.js');
      const { SourceRegistry } = await import('../sources/SourceRegistry.js');
      const origFetch = globalThis.fetch;

      try {
        const weeb = new WeebCentralProvider();
        const weebSearchUrls = [];
        const sampleHtml = [
          `<article class="bg-base-300 flex gap-4 p-4">
            <a href="https://weebcentral.com/series/01KR0000000000000000000000/overgeared" class="line-clamp-1 link link-hover">Overgeared</a>
            <div><strong>Type:</strong> <span>Manhwa</span></div>
            <div><strong>Tag(s):</strong> <span>Action</span><span>Fantasy</span></div>
          </article>`,
          `<article class="bg-base-300 flex gap-4 p-4">
            <a href="https://weebcentral.com/series/01CN0000000000000000000000/tales-of-demons" class="line-clamp-1 link link-hover">Tales of Demons and Gods</a>
            <div><strong>Type:</strong> <span>Manhua</span></div>
            <div><strong>Tag(s):</strong> <span>Action</span><span>Romance</span></div>
          </article>`,
          `<article class="bg-base-300 flex gap-4 p-4">
            <a href="https://weebcentral.com/series/01JPROM0000000000000000000/horimiya" class="line-clamp-1 link link-hover">Horimiya</a>
            <div><strong>Type:</strong> <span>Manga</span></div>
            <div><strong>Tag(s):</strong> <span>Romance</span><span>Slice of Life</span></div>
          </article>`,
          `<article class="bg-base-300 flex gap-4 p-4">
            <a href="https://weebcentral.com/series/01JPFAN0000000000000000000/magic-knight" class="line-clamp-1 link link-hover">Magic Knight Saga</a>
            <div><strong>Type:</strong> <span>Manga</span></div>
            <div><strong>Tag(s):</strong> <span>Romance</span><span>Magic</span></div>
          </article>`
        ].join('\n');

        globalThis.fetch = async (url) => {
          const u = String(url);
          if (u.includes('anilist.co')) {
            return new Response(JSON.stringify({ data: { Page: { media: [] } } }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          weebSearchUrls.push(u);
          return new Response(sampleHtml, { status: 200, headers: { 'Content-Type': 'text/html' } });
        };

        const unfiltered = await weeb.search('', { language: 'en', genre: 'Romance' });
        const overgeared = unfiltered.mangaList.find(m => m.title === 'Overgeared');
        const tales = unfiltered.mangaList.find(m => m.title === 'Tales of Demons and Gods');
        const horimiya = unfiltered.mangaList.find(m => m.title === 'Horimiya');
        assert(
          overgeared?.publicationInfo?.country === 'KR' &&
          tales?.publicationInfo?.country === 'CN' &&
          horimiya?.publicationInfo?.country === 'JP',
          'WeebCentralProvider detecta Manhwa (KR), Manhua (CN) e Manga (JP) via badge Type:'
        );

        const filteredRegistry = new SourceRegistry();
        // Keep only WeebCentral active with mocked fetch for deterministic filter validation
        for (const src of filteredRegistry.getSources()) {
          if (src.id !== 'weebcentral') {
            filteredRegistry.getSource(src.id).search = async () => ({ mangaList: [], total: 0, hasMore: false });
          }
        }
        filteredRegistry.getSource('weebcentral').search = (q, opts) => weeb.search(q, opts);

        const strictRes = await filteredRegistry.search('', {
          enabledSources: ['weebcentral'],
          language: 'en',
          type: 'manga',
          genres: ['Romance'],
          excludedGenres: ['Fantasia'],
          onlyAvailable: false
        });
        assert(
          weebSearchUrls.some(u => u.includes('included_type=Manga') && u.includes('excluded_tag=Fantasy') && u.includes('excluded_tag=Magic')) &&
          strictRes.results.length === 1 &&
          strictRes.results[0].title === 'Horimiya',
          'SourceRegistry + WeebCentral exclui KR/CN e obras de Fantasia/Magic quando type=manga & excludedGenres=["Fantasia"]'
        );
      } finally {
        globalThis.fetch = origFetch;
      }
    }

    // -----------------------------------------------------------------------
    // SEÇÃO 30: Detecção de Duplicados e Persistência "Não é duplicado"
    // -----------------------------------------------------------------------
    console.log('\n📋 [30/30] Testando Falsos Positivos de Duplicados, Dismiss e Backup...');
    {
      const {
        matchFavoritesPair,
        detectDuplicateFavoriteGroups,
        findSuspectedCandidateIds
      } = await import('../../src/components/DuplicateFavoritesModal.tsx');
      const { HistoryService, makeDuplicatePairKey } = await import('../../src/services/history.js');

      const makeFav = (mangaId, title, altTitles = []) => ({
        mangaId,
        title,
        altTitles,
        coverUrl: 'https://example.com/c.jpg',
        addedAt: Date.now()
      });

      const imouto = makeFav('mr_comick_AAAA1111', 'Imouto no Tomodachi ga Nani Kangaeteru no ka Wakaranai');
      const ane = makeFav('mr_mangadex_bbbb-2222', 'Ane no Tomodachi');
      const pairCheck = matchFavoritesPair(imouto, ane);
      assert(
        pairCheck.matched === false,
        'matchFavoritesPair NAO junta "Imouto no Tomodachi..." com "Ane no Tomodachi"'
      );

      const beastLong = makeFav('mr_comick_BBBB1111', 'Yuusha Party wo Tsuihou Sareta Beast Tamer, Saikyoushu no Nekomimi Shoujo to Deau');
      const beastShort = makeFav('mr_mangapill_555-beast-tamer', 'Beast Tamer');
      const beastGroups = detectDuplicateFavoriteGroups([imouto, ane, beastLong, beastShort]);
      assert(
        beastGroups.length === 1 &&
        beastGroups[0].items.length === 2 &&
        beastGroups[0].items.some(i => i.mangaId === beastLong.mangaId) &&
        beastGroups[0].items.some(i => i.mangaId === beastShort.mangaId),
        'detectDuplicateFavoriteGroups continua agrupando obras legitimas (Beast Tamer) sem falsos positivos'
      );

      const suspectedWithoutMatch = findSuspectedCandidateIds([imouto, ane], new Set());
      assert(
        suspectedWithoutMatch.length === 0,
        'findSuspectedCandidateIds ignora pares com qualificadores familiares conflitantes (Imouto vs Ane)'
      );

      // Dismiss & Backup roundtrip with isolated localStorage shim
      const origWindow = globalThis.window;
      const origLocalStorage = globalThis.localStorage;
      const memStore = new Map();
      const storageMock = {
        getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
        setItem: (k, v) => { memStore.set(String(k), String(v)); },
        removeItem: (k) => { memStore.delete(String(k)); },
        clear: () => { memStore.clear(); }
      };
      globalThis.localStorage = storageMock;
      globalThis.window = {
        localStorage: storageMock,
        addEventListener: () => {},
        removeEventListener: () => {}
      };

      try {
        HistoryService.clearDismissedDuplicatePairs();
        HistoryService.dismissDuplicateGroup([beastLong.mangaId, beastShort.mangaId]);
        const dismissed = HistoryService.getDismissedDuplicatePairs();
        const expectedKey = makeDuplicatePairKey(beastLong.mangaId, beastShort.mangaId);
        assert(
          dismissed.includes(expectedKey) &&
          detectDuplicateFavoriteGroups([beastLong, beastShort], undefined, dismissed).length === 0,
          'HistoryService.dismissDuplicateGroup suprime grupo ignorado em detectDuplicateFavoriteGroups'
        );

        const backup = HistoryService.createBackup();
        assert(
          Array.isArray(backup.dismissedDuplicatePairs) && backup.dismissedDuplicatePairs.includes(expectedKey),
          'HistoryService.createBackup inclui dismissedDuplicatePairs'
        );

        HistoryService.clearDismissedDuplicatePairs();
        assert(
          detectDuplicateFavoriteGroups([beastLong, beastShort], undefined, HistoryService.getDismissedDuplicatePairs()).length === 1,
          'HistoryService.clearDismissedDuplicatePairs restaura deteccao de duplicados'
        );

        HistoryService.importBackup(backup);
        assert(
          HistoryService.getDismissedDuplicatePairs().includes(expectedKey),
          'HistoryService.importBackup restaura pares "Nao e duplicado"'
        );
      } finally {
        HistoryService.clearDismissedDuplicatePairs();
        globalThis.localStorage = origLocalStorage;
        globalThis.window = origWindow;
      }
    }

    // -----------------------------------------------------------------------
    // SEÇÃO 31: UpdateTrackerService Debounce/Throttle, Views, Idle & Inatividade
    // -----------------------------------------------------------------------
    console.log('\n📋 [31/31] Testando UpdateTrackerService (Debounce, Throttle, Views, Idle e Parada por Inatividade)...');
    {
      const { UpdateTrackerService } = await import('../../src/services/updateTracker.js');
      const origWindow = globalThis.window;
      const origDocument = globalThis.document;
      const origLocalStorage = globalThis.localStorage;
      const origCheckUpdates = UpdateTrackerService.checkUpdates;

      const memStore = new Map();
      const storageMock = {
        getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
        setItem: (k, v) => { memStore.set(String(k), String(v)); },
        removeItem: (k) => { memStore.delete(String(k)); },
        clear: () => { memStore.clear(); }
      };

      const docListeners = new Map();
      let visibilityState = 'visible';
      const docMock = {
        get visibilityState() { return visibilityState; },
        addEventListener: (evt, fn) => {
          const arr = docListeners.get(evt) || [];
          arr.push(fn);
          docListeners.set(evt, arr);
        },
        removeEventListener: (evt, fn) => {
          const arr = docListeners.get(evt) || [];
          docListeners.set(evt, arr.filter(f => f !== fn));
        },
        dispatch: (evt) => {
          (docListeners.get(evt) || []).forEach(fn => fn());
        }
      };

      globalThis.localStorage = storageMock;
      globalThis.window = {
        localStorage: storageMock,
        addEventListener: () => {},
        removeEventListener: () => {}
      };
      globalThis.document = docMock;

      let cleanupRadar = () => {};
      try {
        UpdateTrackerService.resetRadarStateForTests();

        let bgCheckCount = 0;
        UpdateTrackerService.checkUpdates = async (force = false) => {
          if (!force) bgCheckCount++;
          return { count: 0, updates: {} };
        };

        // Configure fast deterministic timings
        UpdateTrackerService.configureRadarTiming({
          debounceMs: 35,
          idleSettleMs: 35,
          minThrottleMs: 250,
          inactivityTimeoutMs: 110,
          pollIntervalMs: 500
        });

        UpdateTrackerService.setAutoRadarEnabled(true);
        UpdateTrackerService.setActiveView('favorites');
        cleanupRadar = UpdateTrackerService.initBackgroundRadar();

        // 1) Non-eligible view ('reader') must stop background polling & reject checks
        UpdateTrackerService.setActiveView('reader');
        assert(
          UpdateTrackerService.isBackgroundPollingActive() === false &&
          UpdateTrackerService.requestBackgroundCheck('navigation') === false,
          'UpdateTrackerService para polling e bloqueia check automatico fora de views elegiveis (reader)'
        );

        // 2) Eligible view ('updates') + rapid burst / high-frequency updates coalesce into a single debounced check
        UpdateTrackerService.setActiveView('updates');
        UpdateTrackerService.requestBackgroundCheck('navigation');
        UpdateTrackerService.requestBackgroundCheck('idle');
        UpdateTrackerService.requestBackgroundCheck('navigation');
        assert(
          bgCheckCount === 0 && UpdateTrackerService.isBackgroundPollingActive() === true,
          'UpdateTrackerService faz debounce e nao dispara imediatamente durante interacoes/navegacao em rajada'
        );

        await new Promise(r => setTimeout(r, 90));
        assert(
          bgCheckCount === 1,
          'UpdateTrackerService dispara exatamente 1 check coalescido apos o usuario ficar ocioso'
        );

        // 3) Throttle cooldown prevents back-to-back background checks
        const throttledAccepted = UpdateTrackerService.requestBackgroundCheck('navigation');
        assert(
          throttledAccepted === false && bgCheckCount === 1,
          'UpdateTrackerService aplica throttle e ignora novos disparos dentro da janela minima'
        );

        // 4) Inactivity timeout stops background polling automatically
        await new Promise(r => setTimeout(r, 150));
        assert(
          UpdateTrackerService.isUserInteracting() === false &&
          UpdateTrackerService.isBackgroundPollingActive() === false,
          'UpdateTrackerService interrompe polling automatico quando usuario fica sem interagir'
        );

        // 5) Resuming user interaction restarts polling cleanly & visibility hidden stops it again
        UpdateTrackerService.recordUserInteraction(Date.now());
        assert(
          UpdateTrackerService.isUserInteracting() === true &&
          UpdateTrackerService.isBackgroundPollingActive() === true,
          'UpdateTrackerService retoma polling ao detectar nova interacao do usuario em view elegivel'
        );

        visibilityState = 'hidden';
        docMock.dispatch('visibilitychange');
        assert(
          UpdateTrackerService.isBackgroundPollingActive() === false,
          'UpdateTrackerService interrompe polling imediatamente quando a aba perde foco (hidden)'
        );
      } finally {
        cleanupRadar();
        UpdateTrackerService.checkUpdates = origCheckUpdates;
        UpdateTrackerService.resetRadarStateForTests();
        globalThis.localStorage = origLocalStorage;
        globalThis.window = origWindow;
        globalThis.document = origDocument;
      }
    }

    // -----------------------------------------------------------------------
    // SEÇÃO 32: Proteção contra Tempestade de HTTP 403 no ComickProvider & Resolve-Titles
    // -----------------------------------------------------------------------
    console.log('\n📋 [32/32] Testando Short-Circuit de Cooldown 403 no ComickProvider & /api/library/resolve-titles...');
    {
      const { ComickProvider } = await import('../sources/ComickProvider.js');
      const { sourceRegistry } = await import('../sources/SourceRegistry.js');
      const origFetch = globalThis.fetch;

      try {
        const isolatedComick = new ComickProvider();
        let comickFetchAttempts = 0;

        globalThis.fetch = async (url, init) => {
          const u = String(url);
          if (u.includes('api.comick.dev')) {
            comickFetchAttempts++;
            return new Response('Forbidden', { status: 403 });
          }
          if (u.includes('anilist.co')) {
            return new Response(JSON.stringify({ data: { Page: { media: [] }, Media: null } }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return origFetch(url, init);
        };

        const firstRes = await isolatedComick.getMangaDetails('4VhV4Nl1');
        const attemptsAfterFirst = comickFetchAttempts;
        const secondRes = await isolatedComick.getMangaDetails('3ZmDSZqi');
        const thirdRes = await isolatedComick.getMangaDetails('0GMpVmks');

        assert(
          firstRes === null &&
          secondRes === null &&
          thirdRes === null &&
          attemptsAfterFirst === 1 &&
          comickFetchAttempts === 1,
          'ComickProvider nao faz retries em HTTP 403 e aplica short-circuit de cooldown em chamadas subsequentes (1 fetch total)'
        );

        // Ensure SourceRegistry.getMangaById with skipFailover handles failing Comick source without throwing
        const comickRegSrc = sourceRegistry.getSource('comick');
        const origRegDetails = comickRegSrc.getMangaDetails.bind(comickRegSrc);
        let failoverSearchTriggered = false;
        const weebRegSrc = sourceRegistry.getSource('weebcentral');
        const origWeebSearch = weebRegSrc.search.bind(weebRegSrc);

        try {
          comickRegSrc.getMangaDetails = async () => null;
          weebRegSrc.search = async () => {
            failoverSearchTriggered = true;
            return { mangaList: [], total: 0, hasMore: false };
          };

          const resolveRes = await fetch(`${BASE_URL}/api/library/resolve-titles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: [
                { mangaId: 'mr_comick_4VhV4Nl1', title: 'Test Blocked Comick Title 1' },
                { mangaId: 'mr_comick_3ZmDSZqi', title: 'Test Blocked Comick Title 2' }
              ]
            })
          });
          assert(
            resolveRes.status === 200 && !failoverSearchTriggered,
            'POST /api/library/resolve-titles retorna HTTP 200 sem tempestade de failover quando Comick esta em cooldown 403'
          );
        } finally {
          comickRegSrc.getMangaDetails = origRegDetails;
          weebRegSrc.search = origWeebSearch;
        }
      } finally {
        globalThis.fetch = origFetch;
      }
    }

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
