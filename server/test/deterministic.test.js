/**
 * PARTE 1 — TESTES DETERMINÍSTICOS
 * Esta suíte NÃO depende da disponibilidade ou rede do MangaDex.
 * Testa contratos locais, MockMangaProvider, SourceRegistry e comportamento HTTP da API.
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
    // 1. CONTRATO DO ENDPOINT /api/sources
    // -------------------------------------------------------------------------
    console.log('[1/4] Testando /api/sources e Coexistência de Fontes...');
    const sourcesRes = await fetch(`${BASE_URL}/api/sources`);
    assert(sourcesRes.status === 200, 'GET /api/sources retorna status 200');
    const sourcesJson = await sourcesRes.json();
    assert(sourcesJson.success === true, 'Resposta possui success: true');
    assert(Array.isArray(sourcesJson.data), 'data é um array de fontes');
    
    const mockSource = sourcesJson.data.find(s => s.id === 'mock');
    const dexSource = sourcesJson.data.find(s => s.id === 'mangadex');
    assert(!!mockSource, 'Fonte "mock" está registrada em /api/sources');
    assert(mockSource?.type === 'mock', 'Fonte "mock" possui type === "mock"');
    assert(!!dexSource, 'Fonte "mangadex" está registrada em /api/sources');
    assert(dexSource?.type === 'live_api', 'Fonte "mangadex" possui type === "live_api"');
    assert(sourcesJson.data.length >= 2, 'Coexistência: pelo menos 2 fontes estão ativas');

    // -------------------------------------------------------------------------
    // 2. BUSCA E FILTROS DO MOCK
    // -------------------------------------------------------------------------
    console.log('\n[2/4] Testando Busca e Filtros do Mock...');
    const searchMockRes = await fetch(`${BASE_URL}/api/search?source=mock&q=frieren`);
    assert(searchMockRes.status === 200, 'GET /api/search?source=mock&q=frieren retorna 200');
    const searchMockJson = await searchMockRes.json();
    assert(searchMockJson.total > 0, 'Busca retorna ao menos 1 resultado para "frieren" no mock');
    assert(searchMockJson.data[0]?.id.startsWith('mr_mock_'), 'ID gerado possui prefixo canônico "mr_mock_"');
    assert(searchMockJson.data[0]?.title.includes('Frieren'), 'Título corresponde ao mangá pesquisado');

    const genreRes = await fetch(`${BASE_URL}/api/search?source=mock&genre=Aventura`);
    assert(genreRes.status === 200, 'GET /api/search?source=mock&genre=Aventura retorna 200');
    const genreJson = await genreRes.json();
    assert(genreJson.total > 0, 'Filtro por gênero retorna resultados no mock');
    assert(genreJson.data.every(m => m.genres.some(g => g.toLowerCase() === 'aventura')), 'Todos os resultados contêm o gênero Aventura');

    // -------------------------------------------------------------------------
    // 3. DETALHES, CAPÍTULOS E PÁGINAS DO MOCK
    // -------------------------------------------------------------------------
    console.log('\n[3/4] Testando Detalhes, Capítulos e Páginas do Mock...');
    const mangaRes = await fetch(`${BASE_URL}/api/manga/mr_mock_frieren-journey`);
    assert(mangaRes.status === 200, 'GET /api/manga/mr_mock_frieren-journey retorna 200');
    const mangaJson = await mangaRes.json();
    assert(mangaJson.data?.id === 'mr_mock_frieren-journey', 'ID do mangá retornado é exatamente mr_mock_frieren-journey');
    assert(mangaJson.data?.sources[0]?.sourceId === 'mock', 'SourceId do vínculo primário é "mock"');

    const chRes = await fetch(`${BASE_URL}/api/manga/mr_mock_frieren-journey/chapters`);
    assert(chRes.status === 200, 'GET /api/manga/mr_mock_frieren-journey/chapters retorna 200');
    const chJson = await chRes.json();
    assert(chJson.total === 3, 'Mock de Frieren possui 3 capítulos cadastrados');
    assert(chJson.data[0]?.id.startsWith('ch_mock_'), 'ID do capítulo possui prefixo canônico "ch_mock_"');
    assert(chJson.data[0]?.mangaId === 'mr_mock_frieren-journey', 'Capítulo vinculado ao ID canônico correto');

    const pagesRes = await fetch(`${BASE_URL}/api/chapters/ch_mock_frieren-journey_frieren-ch-01/pages`);
    assert(pagesRes.status === 200, 'GET /api/chapters/.../pages retorna 200');
    const pagesJson = await pagesRes.json();
    assert(pagesJson.total === 6, 'Capítulo 1 possui 6 páginas resolvidas');
    assert(pagesJson.data[0]?.pageNumber === 1, 'Páginas numeradas a partir de 1');
    assert(typeof pagesJson.data[0]?.imageUrl === 'string', 'Páginas possuem URL de imagem válida');

    // -------------------------------------------------------------------------
    // 4. TRATAMENTO DE ERROS SEMÂNTICOS (400 vs 404)
    // -------------------------------------------------------------------------
    console.log('\n[4/4] Testando Semântica de Erros (400 vs 404)...');
    
    // 4.1 Erro 400: Formato de ID inválido
    const r400Manga = await fetch(`${BASE_URL}/api/manga/id_sem_prefixo_valido`);
    assert(r400Manga.status === 400, 'ID de mangá sem formato "mr_<source>_<id>" retorna HTTP 400');
    const r400MangaJson = await r400Manga.json();
    assert(r400MangaJson.error.includes('Formato de identificador de mangá inválido'), 'Mensagem explicativa de formato de mangá inválido');

    const r400Ch = await fetch(`${BASE_URL}/api/chapters/ch_incompleto/pages`);
    assert(r400Ch.status === 400, 'ID de capítulo com partes insuficientes retorna HTTP 400');
    const r400ChJson = await r400Ch.json();
    assert(r400ChJson.error.includes('Formato de identificador de capítulo inválido'), 'Mensagem explicativa de formato de capítulo inválido');

    // 4.2 Erro 404: Recurso bem-formatado, mas inexistente
    const r404Manga = await fetch(`${BASE_URL}/api/manga/mr_mock_obra-inexistente-123`);
    assert(r404Manga.status === 404, 'Mangá inexistente no catálogo mock retorna HTTP 404');

    const r404Ch = await fetch(`${BASE_URL}/api/manga/mr_mock_obra-inexistente-123/chapters`);
    assert(r404Ch.status === 404, 'Busca de capítulos para mangá inexistente retorna HTTP 404');
    const r404ChJson = await r404Ch.json();
    assert(r404ChJson.error.includes('não encontrado no catálogo Mock'), 'Mensagem indica que obra não foi encontrada no mock');

    const r404Pages = await fetch(`${BASE_URL}/api/chapters/ch_mock_frieren-journey_cap-inexistente/pages`);
    assert(r404Pages.status === 404, 'Capítulo inexistente no catálogo mock retorna HTTP 404');

    const r404Source = await fetch(`${BASE_URL}/api/manga/mr_fontefantasma_123/chapters`);
    assert(r404Source.status === 404, 'Fonte não registrada no ID retorna HTTP 404');
    const r404SourceJson = await r404Source.json();
    assert(r404SourceJson.error.includes('não encontrada'), 'Mensagem informa que a fonte não foi encontrada');

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
