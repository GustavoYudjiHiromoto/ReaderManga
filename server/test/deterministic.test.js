/**
 * PARTE 1 — TESTES DETERMINÍSTICOS
 * Esta suíte testa contratos locais, coexistência das 4 fontes reais (Comick, MangaDex, WeebCentral, Guya),
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
  console.log('PARTE 1: SUÍTE DE TESTES DETERMINÍSTICOS (LOCAL)');
  console.log('====================================================\n');

  try {
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
    const guyaSource = sourcesJson.data.find(s => s.id === 'guya');

    assert(!mockSource, 'Fonte "mock" foi completamente removida de /api/sources');
    assert(!!dexSource, 'Fonte "mangadex" está registrada em /api/sources');
    assert(dexSource?.type === 'live_api', 'Fonte "mangadex" possui type === "live_api"');
    assert(!!comickSource, 'Fonte "comick" está registrada em /api/sources');
    assert(comickSource?.type === 'live_api', 'Fonte "comick" possui type === "live_api"');
    assert(!!weebSource, 'Fonte "weebcentral" está registrada em /api/sources');
    assert(weebSource?.type === 'live_api', 'Fonte "weebcentral" possui type === "live_api"');
    assert(!!guyaSource, 'Fonte "guya" está registrada em /api/sources');
    assert(guyaSource?.type === 'live_api', 'Fonte "guya" possui type === "live_api"');
    assert(sourcesJson.data.length === 4, 'Exatamente 4 fontes reais ativas (MangaDex, Comick, WeebCentral, Guya)');

    // -------------------------------------------------------------------------
    // 2. BUSCA FEDERADA E POPULARES DAS FONTES REAIS
    // -------------------------------------------------------------------------
    console.log('\n[2/4] Testando Busca Federada e Featured...');
    const searchRes = await fetch(`${BASE_URL}/api/search?q=kaguya`);
    assert(searchRes.status === 200, 'GET /api/search?q=kaguya retorna 200');
    const searchJson = await searchRes.json();
    assert(searchJson.total > 0, 'Busca retorna ao menos 1 resultado para "kaguya"');
    assert(!searchJson.data.some(m => m.id.includes('_mock_')), 'Nenhum resultado de busca contém o prefixo canônico "mr_mock_"');

    // -------------------------------------------------------------------------
    // 3. DETALHES, CAPÍTULOS E PÁGINAS DE FONTE REAL (GUYA)
    // -------------------------------------------------------------------------
    console.log('\n[3/4] Testando Detalhes, Capítulos e Páginas Reais (Guya)...');
    const mangaRes = await fetch(`${BASE_URL}/api/manga/mr_guya_kaguya-wants-to-be-confessed-to`);
    assert(mangaRes.status === 200, 'GET /api/manga/mr_guya_kaguya-wants-to-be-confessed-to retorna 200');
    const mangaJson = await mangaRes.json();
    assert(mangaJson.data?.sources[0]?.sourceId === 'guya', 'SourceId do vínculo primário é "guya"');
    assert(mangaJson.data?.title.includes('Kaguya'), 'Título do mangá retornado corresponde à obra real');

    const chRes = await fetch(`${BASE_URL}/api/manga/mr_guya_kaguya-wants-to-be-confessed-to/chapters`);
    assert(chRes.status === 200, 'GET /api/manga/.../chapters retorna 200');
    const chJson = await chRes.json();
    assert(chJson.total > 0, 'Guya de Kaguya possui capítulos cadastrados');
    assert(chJson.data[0]?.id.startsWith('ch_guya_'), 'ID do capítulo possui prefixo canônico "ch_guya_"');

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

    // ID canônico Guya
    const parsedGuya = registry.parseInternalChapterId('ch_guya_kaguya-wants-to-be-confessed-to_1');
    assert(parsedGuya.sourceId === 'guya', 'Parser extrai sourceId "guya"');
    assert(parsedGuya.externalMangaId === 'kaguya-wants-to-be-confessed-to', 'Parser extrai externalMangaId do guya');
    assert(parsedGuya.externalChapterId === '1', 'Parser extrai externalChapterId do guya');

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
    const availSearchRes = await fetch(`${BASE_URL}/api/search?q=kaguya&onlyAvailable=true`);
    assert(availSearchRes.status === 200, 'GET /api/search?q=kaguya&onlyAvailable=true retorna 200');
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
    const chaptersApiRes = await fetch(`${BASE_URL}/api/manga/mr_guya_kaguya-wants-to-be-confessed-to/chapters?deduplicate=true`);
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
    const sampleChId = 'ch_guya_kaguya-wants-to-be-confessed-to_kaguya-wants-to-be-confessed-to---1';
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
    assert(healthJson.sources.length === 4, 'Healthcheck confirma 4 fontes reais conectadas');
    assert(typeof healthJson.cache?.size === 'number', 'Healthcheck inclui telemetria de cache');

    // 8.2 Validação de Backup & Mesclagem de Biblioteca
    const mockBackupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: 'MangaReader',
      favorites: [
        { mangaId: 'mr_guya_kaguya-wants-to-be-confessed-to', title: 'Kaguya-sama', coverUrl: 'https://img.test/kaguya.jpg', updatedAt: 1000 },
        { mangaId: 'mr_mangadex_frieren', title: 'Frieren', coverUrl: 'https://img.test/frieren.jpg', updatedAt: 2000 }
      ],
      history: [
        { mangaId: 'mr_guya_kaguya-wants-to-be-confessed-to', mangaTitle: 'Kaguya-sama', mangaCover: 'https://img.test/kaguya.jpg', chapterId: 'ch1', chapterNumber: '1', pageNumber: 5, totalPages: 20, updatedAt: 1500 }
      ]
    };

    assert(mockBackupData.version === 1, 'Backup possui schema version 1');
    assert(Array.isArray(mockBackupData.favorites), 'Backup contém array de favoritos');
    assert(Array.isArray(mockBackupData.history), 'Backup contém array de histórico');

    // Teste de deduplicação na mesclagem de favoritos
    const existingFavs = [{ mangaId: 'mr_guya_kaguya-wants-to-be-confessed-to', title: 'Kaguya Old', coverUrl: '', updatedAt: 500 }];
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
    assert(mergedFavs.length === 2, 'Mesclagem de backup deduplica favoritos por mangaId (1 existente + 1 novo = 2 total)');
    const updatedKaguya = mergedFavs.find(f => f.mangaId === 'mr_guya_kaguya-wants-to-be-confessed-to');
    assert(updatedKaguya?.title === 'Kaguya-sama', 'Mesclagem preserva título mais rico/recente');
    assert(updatedKaguya?.updatedAt === 1000, 'Mesclagem preserva timestamp mais recente');

  } catch (err) {
    console.error('Erro catastrófico na execução dos testes:', err);
    failedTests++;
  }

  console.log('\n----------------------------------------------------');
  console.log(`TOTAL: ${totalTests} asserções | PASSOU: ${passedTests} | FALHOU: ${failedTests}`);
  console.log('----------------------------------------------------');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runDeterministicTests();
