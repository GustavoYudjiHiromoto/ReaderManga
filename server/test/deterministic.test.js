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
