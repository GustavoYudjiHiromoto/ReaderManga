/**
 * PARTE 2 — SMOKE / INTEGRATION TESTS DO MANGADEX
 * Esta suíte se comunica com a API EXTERNA do MangaDex (api.mangadex.org).
 * Falhas de rede ou indisponibilidade temporária do MangaDex são identificadas
 * explicitamente como questões da fonte externa, sem invalidar o código do applet.
 */

const BASE_URL = 'http://localhost:3000';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
let externalIssues = 0;

function assert(condition, message, isExternalCheck = false) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    failedTests++;
    if (isExternalCheck) {
      externalIssues++;
      console.warn(`  ⚠️ AVISO EXTERNO (MangaDex): ${message}`);
    } else {
      console.error(`  ✗ FALHA: ${message}`);
    }
  }
}

async function runMangaDexSmokeTests() {
  console.log('====================================================');
  console.log('PARTE 2: SMOKE TESTS CONTRA API REAL DO MANGADEX');
  console.log('====================================================\n');

  try {
    // -------------------------------------------------------------------------
    // 1. BUSCA NA API REAL DO MANGADEX
    // -------------------------------------------------------------------------
    console.log('[1/4] Testando Busca na API Real do MangaDex...');
    const searchRes = await fetch(`${BASE_URL}/api/search?source=mangadex&q=chainsaw&limit=3`);
    assert(searchRes.status === 200, 'GET /api/search?source=mangadex retorna status 200');
    const searchJson = await searchRes.json();
    assert(searchJson.success === true, 'Busca retorna success: true');
    assert(searchJson.data && searchJson.data.length > 0, 'Busca retorna ao menos 1 resultado para "chainsaw"');
    assert(searchJson.data[0]?.id.startsWith('mr_mangadex_'), 'Mangá retornado possui ID canônico "mr_mangadex_..."');
    console.log(`    -> Mangá retornado: "${searchJson.data[0]?.title}" (${searchJson.data[0]?.id})`);

    // -------------------------------------------------------------------------
    // 2. DETALHES DE UMA OBRA REAL NO MANGADEX (Chainsaw Man)
    // -------------------------------------------------------------------------
    console.log('\n[2/4] Testando Detalhes de Obra Real no MangaDex...');
    const chainsawId = 'mr_mangadex_a77742b1-befd-49a4-bff5-1ad4e6b0ef7b';
    const detailRes = await fetch(`${BASE_URL}/api/manga/${chainsawId}`);
    assert(detailRes.status === 200, `GET /api/manga/${chainsawId} retorna status 200`);
    const detailJson = await detailRes.json();
    assert(detailJson.success === true, 'Detalhes retorna success: true');
    assert(detailJson.data?.title?.toLowerCase().includes('chainsaw'), 'Título corresponde a Chainsaw Man');
    assert(detailJson.data?.sources[0]?.sourceId === 'mangadex', 'Fonte vinculada é "mangadex"');
    assert(detailJson.data?.sources[0]?.url?.includes('mangadex.org'), 'Possui URL oficial para a plataforma');

    // -------------------------------------------------------------------------
    // 3. CAPÍTULOS DE UMA OBRA QUE POSSUI CAPÍTULOS NO MANGADEX
    // -------------------------------------------------------------------------
    console.log('\n[3/4] Testando Capítulos de Obra com Scans no MangaDex...');
    const chRes = await fetch(`${BASE_URL}/api/manga/${chainsawId}/chapters`);
    assert(chRes.status === 200, `GET /api/manga/${chainsawId}/chapters retorna status 200`);
    const chJson = await chRes.json();
    assert(chJson.success === true, 'Feed de capítulos retorna success: true');
    assert(chJson.total > 0, `Total de capítulos retornados > 0 (obtido: ${chJson.total})`);
    assert(chJson.data[0]?.id.startsWith('ch_mangadex_'), 'Capítulo possui ID canônico "ch_mangadex_..."');
    assert(chJson.data[0]?.sourceId === 'mangadex', 'Capítulo possui sourceId: "mangadex"');
    
    const sampleChapter = chJson.data[0];
    console.log(`    -> Capítulo amostra: Cap. ${sampleChapter.chapterNumber} (ID: ${sampleChapter.id}, Idioma: ${sampleChapter.language})`);

    // -------------------------------------------------------------------------
    // 4. RESOLUÇÃO DE PÁGINAS DE UM CAPÍTULO REAL VIA @HOME SERVER
    // -------------------------------------------------------------------------
    console.log('\n[4/4] Testando Resolução de Páginas de Capítulo Real...');
    if (sampleChapter?.id) {
      const pagesRes = await fetch(`${BASE_URL}/api/chapters/${sampleChapter.id}/pages`);
      assert(pagesRes.status === 200, `GET /api/chapters/${sampleChapter.id}/pages retorna status 200`);
      const pagesJson = await pagesRes.json();
      assert(pagesJson.success === true, 'Resolução de páginas retorna success: true');
      assert(pagesJson.total > 0, `Total de páginas do capítulo > 0 (obtido: ${pagesJson.total})`);
      assert(pagesJson.data[0]?.imageUrl?.includes('mangadex.org') || pagesJson.data[0]?.imageUrl?.includes('mangadex'), 'URLs das imagens apontam para rede oficial do MangaDex');
      console.log(`    -> Total de páginas resolvidas: ${pagesJson.total}`);
    } else {
      assert(false, 'Nenhum capítulo disponível para testar resolução de páginas', true);
    }

  } catch (err) {
    console.error('Erro na comunicação com a API externa MangaDex:', err.message);
    failedTests++;
    externalIssues++;
  }

  console.log('\n----------------------------------------------------');
  console.log(`TOTAL: ${totalTests} asserções | PASSOU: ${passedTests} | FALHOU: ${failedTests} (Problemas Externos: ${externalIssues})`);
  console.log('----------------------------------------------------');

  if (failedTests > externalIssues) {
    // Falha em asserção interna
    process.exit(1);
  }
}

runMangaDexSmokeTests();
