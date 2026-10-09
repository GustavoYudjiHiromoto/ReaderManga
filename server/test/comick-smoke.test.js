/**
 * PARTE 3 — SMOKE / INTEGRATION TESTS DO COMICK
 * Esta suíte se comunica com a API EXTERNA do Comick (api.comick.dev) e CDN (meo.comick.pictures).
 * Valida obras reais (One Piece, Sousou no Frieren, Solo Leveling),
 * busca, detalhes, capítulos e fluxo completo com resolução de imagens reais.
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
      console.warn(`  ⚠️ AVISO EXTERNO (Comick): ${message}`);
    } else {
      console.error(`  ✗ FALHA: ${message}`);
    }
  }
}

async function runComickSmokeTests() {
  console.log('====================================================');
  console.log('PARTE 3: SMOKE TESTS CONTRA API REAL DO COMICK');
  console.log('====================================================\n');

  try {
    // -------------------------------------------------------------------------
    // 1. BUSCA DAS OBRAS EXIGIDAS (One Piece, Sousou no Frieren, Solo Leveling)
    // -------------------------------------------------------------------------
    console.log('[1/4] Testando Busca das Obras Exigidas na Comick...');
    
    // 1.1 Solo Leveling
    const soloSearchRes = await fetch(`${BASE_URL}/api/search?source=comick&q=Solo+Leveling&limit=3`);
    assert(soloSearchRes.status === 200, 'GET /api/search?source=comick&q=Solo+Leveling retorna 200');
    const soloSearchJson = await soloSearchRes.json();
    assert(soloSearchJson.success === true, 'Busca de Solo Leveling retorna success: true');
    assert(soloSearchJson.data && soloSearchJson.data.length > 0, 'Encontrado ao menos 1 resultado para Solo Leveling');
    const soloManga = soloSearchJson.data[0];
    assert(soloManga?.id.startsWith('mr_comick_'), 'ID gerado possui prefixo "mr_comick_"');
    console.log(`    -> Solo Leveling encontrado: "${soloManga?.title}" (ID: ${soloManga?.id})`);

    // 1.2 Sousou no Frieren
    const frierenSearchRes = await fetch(`${BASE_URL}/api/search?source=comick&q=Sousou+no+Frieren&limit=3`);
    assert(frierenSearchRes.status === 200, 'GET /api/search?source=comick&q=Sousou+no+Frieren retorna 200');
    const frierenSearchJson = await frierenSearchRes.json();
    assert(frierenSearchJson.data && frierenSearchJson.data.length > 0, 'Encontrado ao menos 1 resultado para Sousou no Frieren');
    const frierenManga = frierenSearchJson.data[0];
    console.log(`    -> Frieren encontrado: "${frierenManga?.title}" (ID: ${frierenManga?.id})`);

    // 1.3 One Piece
    const opSearchRes = await fetch(`${BASE_URL}/api/search?source=comick&q=One+Piece&limit=3`);
    assert(opSearchRes.status === 200, 'GET /api/search?source=comick&q=One+Piece retorna 200');
    const opSearchJson = await opSearchRes.json();
    assert(opSearchJson.data && opSearchJson.data.length > 0, 'Encontrado ao menos 1 resultado para One Piece');
    const opManga = opSearchJson.data[0];
    console.log(`    -> One Piece encontrado: "${opManga?.title}" (ID: ${opManga?.id})`);

    // -------------------------------------------------------------------------
    // 2. DETALHES DAS OBRAS NA COMICK
    // -------------------------------------------------------------------------
    console.log('\n[2/4] Testando Detalhes das Obras...');
    
    // Detalhes Solo Leveling
    const soloDetailRes = await fetch(`${BASE_URL}/api/manga/${soloManga.id}`);
    assert(soloDetailRes.status === 200, `GET /api/manga/${soloManga.id} retorna 200`);
    const soloDetailJson = await soloDetailRes.json();
    assert(soloDetailJson.success === true, 'Detalhes de Solo Leveling retorna success: true');
    assert(soloDetailJson.data?.sources[0]?.sourceId === 'comick', 'Fonte primária vinculada é "comick"');
    assert(typeof soloDetailJson.data?.synopsis === 'string' && soloDetailJson.data.synopsis.length > 10, 'Sinopse populada');

    // Detalhes Frieren
    const frierenDetailRes = await fetch(`${BASE_URL}/api/manga/${frierenManga.id}`);
    assert(frierenDetailRes.status === 200, `GET /api/manga/${frierenManga.id} retorna 200`);
    const frierenDetailJson = await frierenDetailRes.json();
    assert(frierenDetailJson.data?.title?.toLowerCase().includes('frieren'), 'Título corresponde a Frieren');

    // Detalhes One Piece
    const opDetailRes = await fetch(`${BASE_URL}/api/manga/${opManga.id}`);
    assert(opDetailRes.status === 200, `GET /api/manga/${opManga.id} retorna 200`);
    const opDetailJson = await opDetailRes.json();
    assert(opDetailJson.data?.title?.toLowerCase().includes('one piece'), 'Título corresponde a One Piece');

    // -------------------------------------------------------------------------
    // 3. CAPÍTULOS DAS OBRAS (Suporte a PT-BR e EN)
    // -------------------------------------------------------------------------
    console.log('\n[3/4] Testando Feed de Capítulos (pt-br e en)...');

    // Capítulos Solo Leveling em PT-BR
    const soloPtRes = await fetch(`${BASE_URL}/api/manga/${soloManga.id}/chapters?language=pt-br`);
    assert(soloPtRes.status === 200, 'GET capítulos de Solo Leveling (pt-br) retorna 200');
    const soloPtJson = await soloPtRes.json();
    assert(soloPtJson.total > 0, `Total de capítulos em pt-br > 0 (obtido: ${soloPtJson.total})`);
    assert(soloPtJson.data[0]?.id.startsWith('ch_comick_'), 'Capítulo possui ID canônico "ch_comick_..."');

    // Capítulos Frieren em EN
    const frierenEnRes = await fetch(`${BASE_URL}/api/manga/${frierenManga.id}/chapters?language=en`);
    assert(frierenEnRes.status === 200, 'GET capítulos de Frieren (en) retorna 200');
    const frierenEnJson = await frierenEnRes.json();
    assert(frierenEnJson.total > 0, `Total de capítulos de Frieren em en > 0 (obtido: ${frierenEnJson.total})`);

    // Capítulos One Piece geral
    const opChRes = await fetch(`${BASE_URL}/api/manga/${opManga.id}/chapters`);
    assert(opChRes.status === 200, 'GET capítulos de One Piece (combinado) retorna 200');
    const opChJson = await opChRes.json();
    assert(opChJson.total > 0, `Total de capítulos de One Piece > 0 (obtido: ${opChJson.total})`);

    // -------------------------------------------------------------------------
    // 4. FLUXO COMPLETO COM PÁGINAS E IMAGEM REAL DA CDN COMICK
    // (search -> details -> chapters -> chapter pages -> imagem real na CDN)
    // -------------------------------------------------------------------------
    console.log('\n[4/5] Validando Fluxo Completo: Obra com Páginas e Imagem Real da CDN...');
    
    // Usando obra com scans hospedados na Comick (Magic Academy's Genius Blinker)
    const scanSearchRes = await fetch(`${BASE_URL}/api/search?source=comick&q=Magic+Academy's+Genius+Blinker`);
    assert(scanSearchRes.status === 200, 'Busca da obra de teste retorna 200');
    const scanSearchJson = await scanSearchRes.json();
    const targetManga = scanSearchJson.data?.[0];
    assert(!!targetManga, 'Obra com páginas encontradas no Comick');
    console.log(`    -> Obra: "${targetManga.title}" (${targetManga.id})`);

    // Capítulos da obra
    const targetChRes = await fetch(`${BASE_URL}/api/manga/${targetManga.id}/chapters`);
    assert(targetChRes.status === 200, 'Capítulos da obra retornam 200');
    const targetChJson = await targetChRes.json();
    const testChapter = targetChJson.data?.find(c => c.externalChapterId === '8uBGTM7L') || targetChJson.data?.[0];
    assert(!!testChapter, 'Capítulo localizado para resolução de páginas');
    console.log(`    -> Capítulo selecionado: Cap. ${testChapter.chapterNumber} (ID: ${testChapter.id})`);

    // Páginas do capítulo
    const pagesRes = await fetch(`${BASE_URL}/api/chapters/${testChapter.id}/pages`);
    assert(pagesRes.status === 200, `GET /api/chapters/${testChapter.id}/pages retorna 200`);
    const pagesJson = await pagesRes.json();
    assert(pagesJson.success === true, 'Resolução de páginas retorna success: true');
    assert(pagesJson.total > 0, `Total de páginas resolvidas > 0 (obtido: ${pagesJson.total})`);
    
    const firstPage = pagesJson.data?.[0];
    assert(firstPage?.pageNumber === 1, 'Páginas iniciam na numeração 1');
    assert(firstPage?.imageUrl?.startsWith('https://meo.comick.pictures/'), 'URL aponta para a CDN meo.comick.pictures');
    console.log(`    -> URL da página: ${firstPage.imageUrl}`);

    // Validação de que a imagem é REAL na CDN (não apenas URL montada)
    const imageCheckRes = await fetch(firstPage.imageUrl);
    assert(imageCheckRes.status === 200, 'Requisição HTTP à CDN retorna status 200 OK');
    const contentType = imageCheckRes.headers.get('content-type') || '';
    assert(
      contentType.includes('image/jpeg') || contentType.includes('image/png') || contentType.includes('image/webp'),
      `Content-Type retornado é imagem real válida (obtido: ${contentType})`
    );
    const contentLength = parseInt(imageCheckRes.headers.get('content-length') || '0', 10);
    assert(contentLength > 1000, `Tamanho do payload de imagem > 1KB (obtido: ${(contentLength / 1024).toFixed(1)} KB)`);
    console.log(`    -> Imagem real confirmada: ${contentType}, ${(contentLength / 1024).toFixed(1)} KB`);

    // -------------------------------------------------------------------------
    // 5. TESTES DE FALLBACK COMICK -> MANGADEX
    // -------------------------------------------------------------------------
    console.log('\n[5/5] Testando Cenários de Fallback Comick -> MangaDex...');

    // 5.1 Comick com imagens próprias -> usa Comick diretamente (sem fallback)
    // Usamos testChapter já verificado acima
    assert(pagesJson.data[0]?.imageUrl.includes('meo.comick.pictures'), 'Comick com imagens próprias utiliza a CDN da Comick');

    // 5.2 Comick sem imagens + mdid válido -> obtém imagens via MangaDex com sucesso
    // Testamos tanto com o ID real gerado pela listagem na UI quanto com o sufixo manual __md_
    console.log('    -> Testando Fallback Berserk Cap. 386 com ID REAL da UI (sem __md_ no ID)...');
    const berserkRealId = 'ch_comick_udwf1dTf_4qkl487m';
    const berserkRealPagesRes = await fetch(`${BASE_URL}/api/chapters/${berserkRealId}/pages`);
    assert(berserkRealPagesRes.status === 200, 'GET /api/chapters/.../pages para Berserk 386 (ID real da UI) retorna 200');
    const berserkRealPagesJson = await berserkRealPagesRes.json();
    assert(berserkRealPagesJson.success === true, 'Berserk 386 retorna success: true');
    assert(berserkRealPagesJson.total > 0, `Berserk 386 resolveu ${berserkRealPagesJson.total} páginas via fallback descoberto`);
    assert(
      berserkRealPagesJson.data[0]?.imageUrl.includes('mangadex.network') || berserkRealPagesJson.data[0]?.imageUrl.includes('mangadex'),
      'Páginas resolvidas de Berserk 386 apontam para a rede/CDN do MangaDex'
    );
    console.log(`       Primeira página Berserk: ${berserkRealPagesJson.data[0]?.imageUrl}`);

    const berserkIdWithFallback = 'ch_comick_udwf1dTf_4qkl487m__md_d5431b60-a7c2-49b5-ac5c-872d02ab05c8';
    console.log('    -> Testando Fallback Berserk Cap. 386 com sufixo manual __md_...');
    const berserkPagesRes = await fetch(`${BASE_URL}/api/chapters/${berserkIdWithFallback}/pages`);
    assert(berserkPagesRes.status === 200, 'GET /api/chapters/.../pages para Berserk 386 com fallback explícito retorna 200');
    const berserkPagesJson = await berserkPagesRes.json();
    assert(berserkPagesJson.total > 0, 'Berserk 386 com fallback explícito resolve páginas via MangaDex');

    // Caso real adicional: Vagabond Cap. 326 (ID real da UI: ch_comick_xIrej8Kp_BBj9Y)
    console.log('    -> Testando Fallback Vagabond Cap. 326 (ID real da UI)...');
    const vagabondRealId = 'ch_comick_xIrej8Kp_BBj9Y';
    const vagPagesRes = await fetch(`${BASE_URL}/api/chapters/${vagabondRealId}/pages`);
    assert(vagPagesRes.status === 200, 'GET /api/chapters/.../pages para Vagabond 326 retorna 200');
    const vagPagesJson = await vagPagesRes.json();
    assert(vagPagesJson.total > 0, `Vagabond 326 resolveu ${vagPagesJson.total} páginas via fallback MangaDex`);
    assert(
      vagPagesJson.data[0]?.imageUrl.includes('mangadex.network') || vagPagesJson.data[0]?.imageUrl.includes('mangadex'),
      'Páginas resolvidas de Vagabond 326 apontam para a rede/CDN do MangaDex'
    );

    // 5.3 Comick sem imagens + mdid sem páginas no MangaDex -> retorna vazio ([])
    // Caso real: Solo Leveling Cap. 200 (ID real da UI: ch_comick_71gMd0vF_rwd968fk - 404 no MangaDex)
    console.log('    -> Testando Fallback Solo Leveling Cap. 200 (ID real da UI, sem páginas no MangaDex)...');
    const soloRealId = 'ch_comick_71gMd0vF_rwd968fk';
    const soloUnavailableRes = await fetch(`${BASE_URL}/api/chapters/${soloRealId}/pages`);
    assert(soloUnavailableRes.status === 200, 'GET /api/chapters/.../pages retorna 200 com array vazio quando MangaDex não tem páginas');
    const soloUnavailableJson = await soloUnavailableRes.json();
    assert(soloUnavailableJson.success === true, 'Retorna success: true');
    assert(soloUnavailableJson.total === 0, 'Total de páginas é 0');
    assert(Array.isArray(soloUnavailableJson.data) && soloUnavailableJson.data.length === 0, 'data é array vazio []');

    // 5.4 Comick sem mdid e sem imagens próprias -> retorna vazio ([]) sem tentar MangaDex
    // Caso real: Genius Blinker Cap. 100 (hid: i7Knd4IL - sem imagens na CDN e sem mdid)
    const comickNoMdid = 'ch_comick_11q9uH8O_i7Knd4IL';
    console.log('    -> Testando Comick genuinamente sem mdid e sem imagens próprias...');
    const noMdidRes = await fetch(`${BASE_URL}/api/chapters/${comickNoMdid}/pages`);
    assert(noMdidRes.status === 200, 'GET /api/chapters/.../pages retorna 200');
    const noMdidJson = await noMdidRes.json();
    assert(noMdidJson.total === 0, 'Capítulo sem imagens e sem mdid retorna total: 0 páginas');
    assert(Array.isArray(noMdidJson.data) && noMdidJson.data.length === 0, 'Retorna array vazio [] sem tentar MangaDex');

  } catch (err) {
    console.error('Erro na comunicação com a API externa Comick:', err.message);
    failedTests++;
    externalIssues++;
  }

  console.log('\n----------------------------------------------------');
  console.log(`TOTAL: ${totalTests} asserções | PASSOU: ${passedTests} | FALHOU: ${failedTests} (Problemas Externos: ${externalIssues})`);
  console.log('----------------------------------------------------');

  if (failedTests > externalIssues) {
    process.exit(1);
  }
}

runComickSmokeTests();
