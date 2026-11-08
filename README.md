# MangaReader 📖

Aplicação full-stack moderna e progressiva (PWA) para descoberta, agregação federada e leitura imersiva de mangás, construída com **React 19**, **TypeScript**, **Tailwind CSS v4** e **Express**.

O sistema opera com **federação ao vivo de 6 provedores reais** (zero dados mockados), motor de deduplicação canônica de capítulos, sincronização em nuvem via **Firebase**, integração com **AniList** e **MyAnimeList**, suporte nativo a backups do **Mihon / Tachiyomi (`.tachibk`)** e leitura offline completa.

---

## 🚀 Funcionalidades Principais

### 1. Seis Extensões & Repositórios ao Vivo (Live API)
O MangaReader agrega múltiplos catálogos em paralelo com fallback dinâmico e proxy reverso de imagens:
- **MangaDex**: Catálogo mundial de código aberto com milhões de obras, filtros avançados e suporte multilíngue.
- **Comick**: Agregador moderno com capítulos traduzidos por diversos grupos e fallback para MangaDex.
- **WeebCentral**: Scans diretos em alta definição com CDN otimizada.
- **MangaPill**: Acervo rápido para lançamentos contínuos e capítulos populares.
- **MangaFire**: Extensão federada para pesquisa avançada e catálogo global.
- **MangaBall**: Repositório complementar integrado ao ecossistema de buscas.
- **Central de Extensões (`ExtensionsModal`)**: Ativação/desativação individual de fontes, teste de latência de rede (ping em tempo real) e ordenação de prioridade de busca.

---

### 2. Backups & Compatibilidade Total com Mihon / Tachiyomi (`.tachibk`)
- **Decodificador Nativo de Protocol Buffers (`ProtoReader`)**: Lê e processa mensagens binárias do schema `backup.proto` do Tachiyomi/Mihon sem dependências pesadas.
- **Descompressão de Stream GZIP**: Extração de arquivos `.tachibk` e `.proto.gz` via API nativa do navegador (`DecompressionStream`) com fallback seguro para Node.js (`zlib.gunzipSync` via `/api/backup/decompress`).
- **Feedback Visual com Progresso em Tempo Real (`BackupProgressModal`)**:
  - Barra animada de 0% a 100% com indicador de porcentagem.
  - Ticker dinâmico informando o título da obra que está sendo processada no momento.
  - Checklist de 4 fases: *Leitura*, *Descompressão GZIP*, *Decodificação Protobuf* e *Mesclagem da Biblioteca*.
  - Relatório estatístico final: novos favoritos, capítulos marcados como lidos e pastas/categorias criadas.
- **Importação/Exportação JSON**: Backup completo dos metadados locais, histórico, marcadores e notas pessoais.

---

### 3. Sincronização em Nuvem & Rastreamento Externo
- **Google Cloud & Firestore Sync**: Login com Google via Firebase para manter favoritos, coleções, histórico e notas sincronizados entre celulares, tablets e computadores.
- **AniList & MyAnimeList (Scrobbling Automático)**:
  - Vínculo via GraphQL (AniList) e OAuth2 PKCE (MyAnimeList).
  - Atualização automática de capítulos lidos e volumes concluídos.
  - Serviço em segundo plano (`TrackerBackgroundService`) para sincronização em background sem atrasar a leitura.

---

### 4. Leitor Avançado Imersivo
- **Três Modos de Leitura**:
  - **Cascata Vertical (Webtoon)**: Leitura contínua em coluna, ideal para webtoons/manhwas e telas de smartphones.
  - **Página Única**: Uma página por vez com controles direcionais e zoom.
  - **Página Dupla**: Duas páginas lado a lado simulando a leitura física de livro/mangá.
- **Direção Configurável**: Alternância instantânea entre Mangá Oriental (*RTL - Right to Left*) e Ocidental (*LTR - Left to Right*).
- **Ajuste de Imagem**: Ajustar à largura, à altura ou tamanho original da página.
- **Navegação por Teclas Físicas de Volume (Mobile)**: Botões de volume no Android/iOS viram páginas ou rolam a tela sem necessidade de tocar no display.
- **Pré-carregamento Inteligente (*Prefetching*)**: Carrega as próximas páginas em cache de memória para leitura fluida e sem tela de carregamento.
- **Marcadores de Páginas (*Bookmarks*)**: Salve páginas favoritas com anotações e comentários contextuais.

---

### 5. Motor de Deduplicação de Capítulos (`ChapterDeduplicator`)
- **Consolidação de Variantes**: Agrupa lançamentos do mesmo capítulo feitos por diferentes grupos de tradução (*scanlations*) sob um único item canônico.
- **Seletor de Scanlations**: Escolha o grupo de tradução de sua preferência direto do menu do leitor.
- **Isolamento de Idiomas & Edições**: Capítulos em português (PT-BR) e inglês (EN) permanecem separados. Edições coloridas (*colored*), capítulos especiais e *oneshots* são categorizados isoladamente.

---

### 6. PWA Nativo & Leitura Offline
- **Progressive Web App**: Instalação nativa em Android, iOS, Windows, macOS e Linux com suporte a tela cheia imersiva.
- **Armazenamento Offline**: Cache de imagens de capítulos completos no navegador (`OfflineCacheService`) para leitura sem conexão à internet.
- **Exportação CBZ / ZIP**: Download de qualquer capítulo empacotado para visualizadores de quadrinhos externos.

---

### 7. Organização da Biblioteca & Radar de Lançamentos
- **Categorias no Padrão AniList/MAL**: *Lendo*, *Quero Ler*, *Completos*, *Pausados* e *Abandonados*.
- **Pastas Personalizadas**: Crie coleções temáticas (ex: "Shonen Clássicos", "Obras de Romance", etc.).
- **Edição em Lote (*Batch Mode*)**: Mova dezenas de obras entre categorias, adicione a pastas ou remova simultaneamente.
- **Radar de Novos Capítulos (`UpdateTrackerService`)**: Consulta automática aos provedores para avisar quando suas obras favoritas receberem novos capítulos, com suporte a notificações do navegador.
- **Estatísticas & Analytics**: Métricas de tempo total de leitura, contagem de páginas, ofensiva diária (*reading streak*) e gráficos por gênero literário.

---

## 🛠️ Arquitetura do Repositório

```text
├── index.html                   # Entry point HTML com metadados PWA, SEO e fontes
├── package.json                 # Dependências e scripts de execução/build/testes
├── package-lock.json            # Árvore determinística de dependências (npm ci compatível)
├── vite.config.ts               # Configuração do Vite, Tailwind v4 e PWA Workbox
├── server.ts                    # Entry point full-stack Express + Vite Middleware
├── .github/
│   └── workflows/
│       └── ci.yml               # Pipeline de Integração Contínua (Lint, Build e Testes)
├── server/
│   ├── api/
│   │   └── routes.ts            # Rotas REST da API (fontes, busca, capítulos, proxy, descompressão)
│   ├── cache/
│   │   └── CacheService.ts      # Cache LRU em memória com TTL e métricas de telemetria
│   ├── trackers/
│   │   ├── AniListService.ts    # Integração com API GraphQL do AniList
│   │   ├── MyAnimeListService.ts# Integração com OAuth2 e API REST do MyAnimeList
│   │   └── TrackerRouter.ts     # Rotas HTTP dedicadas aos trackers
│   ├── sources/
│   │   ├── IMangaSource.ts      # Contrato canônico de interface para provedores
│   │   ├── SourceRegistry.ts    # Orquestrador federado, busca paralela e unificação
│   │   ├── ChapterDeduplicator.ts # Algoritmo de deduplicação e pontuação de scanlations
│   │   ├── MangaDexProvider.ts  # Provedor MangaDex
│   │   ├── ComickProvider.ts    # Provedor Comick
│   │   ├── WeebCentralProvider.ts # Provedor WeebCentral
│   │   └── MangaPillProvider.ts # Provedor MangaPill
│   └── test/
│       └── deterministic.test.js # 146 asserções de contrato automatizadas com auto-boot em CI
└── src/
    ├── components/              # Componentes de interface (Navbar, Cards, Modais, Leitor, Progresso)
    │   ├── BackupProgressModal.tsx # Modal de progresso visual para importação Mihon/Tachiyomi
    │   ├── ExtensionsModal.tsx  # Central de extensões, ping e prioridade
    │   ├── TrackersModal.tsx    # Vínculo com AniList e MyAnimeList
    │   └── ReadingAnalytics.tsx # Gráficos e histórico de leitura
    ├── context/
    │   └── AuthContext.tsx      # Autenticação Google e sincronização Firestore
    ├── pages/                   # Telas da SPA (Home, Busca, Catálogo, Detalhes, Leitor, Biblioteca, Perfil)
    ├── services/
    │   ├── api.ts               # Cliente HTTP do frontend
    │   ├── history.ts           # Gestor de biblioteca, progresso e histórico
    │   ├── tachibkService.ts    # Parser de Protobuf e GZIP de backups Mihon (.tachibk)
    │   ├── offlineCache.ts      # Cache offline de capítulos no IndexedDB
    │   └── updateTracker.ts     # Radar de novos capítulos
    └── types/
        └── manga.ts             # Modelos de domínio canônicos (Manga, Chapter, Page, Backup)
```

---

## 📡 Endpoints da API

| Método | Rota | Descrição | Parâmetros Principais |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/sources` | Lista todas as 6 extensões conectadas e seus metadados | N/A |
| `GET` | `/api/sources/:id/ping` | Mede latência em tempo real de uma extensão específica | `id` (ex: `mangadex`, `comick`) |
| `GET` | `/api/search` | Busca federada e unificada em múltiplos provedores | `q`, `sources`, `genre`, `includeAdult`, `onlyAvailable`, `page` |
| `GET` | `/api/manga/featured` | Catálogo de obras em destaque e lançamentos | `limit`, `includeAdult` |
| `GET` | `/api/manga/:id` | Detalhes canônicos completos da obra | ID canônico (`mr_<source>_<id>`) |
| `GET` | `/api/manga/:id/chapters` | Lista de capítulos com suporte a deduplicação | `lang`, `order` (`asc`\|`desc`), `deduplicate` (`true`\|`false`) |
| `GET` | `/api/chapters/:id/pages` | Lista ordenada de páginas resolvidas para leitura | ID do capítulo (`ch_<source>_<mangaId>_<chapterId>`) |
| `GET` | `/api/chapters/:id/download` | Baixar capítulo para leitura externa (.cbz / .zip) | `format` (`cbz`\|`zip`) |
| `POST` | `/api/backup/decompress` | Descompressão segura no servidor para arquivos `.tachibk` | Stream binário GZIP |
| `GET` | `/api/proxy/image` | Proxy reverso de imagens (contorna CORS e Hotlinking) | `url` (URL da imagem codificada) |
| `GET` | `/api/cache/stats` | Telemetria do Cache LRU e taxa de acerto (*Hit Rate*) | N/A |
| `GET` | `/api/health` | Diagnóstico de integridade, uptime, memória e fontes ativas | N/A |
| `GET` | `/api/trackers/search` | Pesquisa de mídias para vínculo no AniList e MAL | `title` |

---

## 💻 Como Executar Localmente

### Pré-requisitos
- **Node.js** v20+ ou v22+
- **npm** v10+

### Instalação e Execução
```bash
# 1. Clonar o repositório
git clone https://github.com/GustavoYudjiHiromoto/ReaderManga.git
cd ReaderManga

# 2. Instalar dependências
npm install

# 3. Iniciar o servidor de desenvolvimento (Frontend + API na porta 3000)
npm run dev
```
Acesse no navegador: **`http://localhost:3000`**

### Scripts Disponíveis
```bash
# Executar a verificação de tipos do TypeScript (Linter)
npm run lint

# Executar a suíte de testes determinísticos de contrato (146 asserções)
npm test

# Compilar aplicação para produção
npm run build

# Iniciar servidor em modo produção
npm run preview
```

---

## 🧪 Testes & Integração Contínua (CI/CD)

O projeto possui suíte de testes rigorosa e automatizada via **GitHub Actions** (`.github/workflows/ci.yml`), validando a cada push e pull request:
1. **Typechecking (`npm run lint`)**: Conformidade estrita com TypeScript.
2. **Build de Produção (`npm run build`)**: Empacotamento de assets via Vite.
3. **Contratos Determinísticos (`npm test`)**: 146 asserções cobrindo:
   - Respostas HTTP 200, 400 e 404 sem dados mockados.
   - Algoritmo de agrupamento e desempate do `ChapterDeduplicator`.
   - Política de expiração e desalocação do Cache LRU.
   - Decodificação de wire-format Protobuf e GZIP de arquivos `.tachibk`.
   - Radar de detecção de novos capítulos.

---

## 🛡️ Licença e Uso de Dados

Este projeto foi desenvolvido para fins educacionais e de pesquisa em arquiteturas de federação web e agregadores PWA. Todas as obras, imagens e conteúdos pertencem exclusivamente aos seus respectivos autores, artistas, editoras e provedores oficiais.
