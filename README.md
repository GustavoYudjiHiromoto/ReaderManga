# MangaReader 📖

Aplicação full-stack moderna para descoberta, agregação e leitura de mangás, construída com **React 19**, **TypeScript**, **Tailwind CSS v4** e **Express**.

O sistema opera com **federação ao vivo de 4 provedores reais** (zero dados mockados), normalização canônica de identificadores, motor de deduplicação de capítulos com variantes por grupo de scanlation e proxy reverso para contorno de restrições de CDN.

---

## 🚀 Funcionalidades Principais

### 1. Quatro Provedores ao Vivo (Live API)
- **MangaDex**: Catálogo global com milhões de títulos comunitários, filtros por idioma e tags.
- **Comick**: Agregador amplo com suporte a múltiplos idiomas e fallback dinâmico para MangaDex.
- **WeebCentral**: Scans diretos em alta definição conectados a CDN estável sem barreiras de licenciamento.
- **Guya / Cubari**: API de alta fidelidade para obras de catálogo curado (*Kaguya-sama*, *Oshi no Ko*, etc.).

### 2. Motor de Deduplicação de Capítulos (`ChapterDeduplicator`)
- **Consolidação Inteligente**: Quando múltiplos grupos de tradução ou provedores cadastram o mesmo capítulo, eles são agrupados sob um item canônico único.
- **Preservação de Variantes**: Os lançamentos alternativos ficam acessíveis como variantes selecionáveis com nome do grupo de scanlation (`scanlationGroup`), contagem de páginas e data.
- **Isolamento de Idiomas & Edições**: Capítulos em português (PT-BR) e inglês (EN) **nunca** são mesclados como duplicatas. Versões coloridas (*colored*), *oneshots* e especiais são preservadas como obras distintas.
- **Seletor no Leitor**: Troca instantânea de versão/scanlation direto do leitor sem perder o progresso.

### 3. Filtro de Conteúdo e Disponibilidade
- **Safe Search (+18)**: Por padrão, conteúdos eróticos e pornográficos são ocultados da busca federada e do catálogo. O parâmetro `includeAdult=true` libera a exibição com badges visuais explícitos (+18).
- **Filtro de Disponibilidade (`onlyAvailable`)**: Obras que possuem apenas metadados registrados em fontes externas (sem capítulos hospedados) são identificadas com badges âmbar e podem ser filtradas para que apenas obras prontas para leitura apareçam no catálogo.

### 4. Leitor Avançado
- **Três Modos de Leitura**: Cascata vertical contínua (*Webtoon*), Página Única e Página Dupla (*Mangá clássico*).
- **Direção de Leitura Configurável**: Alternância entre Mangá Tradicional Japonês (*RTL - Right-to-Left*) e Ocidental (*LTR - Left-to-Right*) com reorientação automática das setas e do par de páginas no modo duplo.
- **Pré-carregamento Inteligente (*Prefetching*)**: Pré-carrega as próximas 3 páginas na memória do navegador para viradas instantâneas sem telas de espera.
- **Quatro Temas**: Escuro (*Dark*), AMOLED (*Black*), Sépia (*Conforto visual*) e Claro (*Light*).
- **Navegação por Teclado**: Setas (`←` / `→`) para paginação, tecla `F` para tela cheia e `Esc` para fechar painéis.
- **Histórico e Marcadores**: Persistência de leitura em `localStorage` com restauração automática de página e indicador de progresso.

### 5. Backup & Restauração de Biblioteca
- **Exportação JSON Padronizada**: Exporta instantaneamente todo o acervo de favoritos e histórico de leitura em arquivo `.json`.
- **Mesclagem Inteligente de Restauração**: Importa backups mesclando obras sem duplicação de títulos, preservando o capítulo e timestamp mais recente.

### 6. Proxy Reverso de Imagens (`/api/proxy/image`)
- Resolve bloqueios de *Hotlinking*, restrições de CORS e `Referer` de CDNs externas de mangá (Comick, MangaDex Network, WeebCentral).
- Mecanismo de fallback de CDN automático quando nós voluntários retornam 404/502.

---

## 🛠️ Arquitetura do Repositório

```text
├── index.html                   # Entry point HTML com metadados SEO e fontes
├── package.json                 # Dependências e scripts de desenvolvimento e testes
├── vite.config.ts               # Configuração do Vite com suporte a Tailwind v4
├── server.ts                    # Entry point Express unificado (monta rotas /api + middlewares Vite)
├── server/
│   ├── api/
│   │   └── routes.ts            # Rotas REST da API pública do MangaReader
│   ├── errors/
│   │   └── HttpError.ts         # Tratamento semântico de erros HTTP (400, 404, 502)
│   ├── sources/
│   │   ├── IMangaSource.ts      # Contrato de interface para provedores
│   │   ├── SourceRegistry.ts    # Orquestrador federado, busca paralela e unificação
│   │   ├── ChapterDeduplicator.ts # Algoritmo de deduplicação e pontuação de capítulos
│   │   ├── MangaDexProvider.ts  # Integração direta com api.mangadex.org
│   │   ├── ComickProvider.ts    # Integração direta com api.comick.dev
│   │   ├── WeebCentralProvider.ts # Integração com weebcentral.com
│   │   └── GuyaProvider.ts      # Integração com guya.cubari.moe
│   └── test/
│       ├── deterministic.test.js # 73 asserções de contrato sem dependências externas
│       ├── mangadex-smoke.test.js # Testes de integração com api.mangadex.org
│       └── comick-smoke.test.js   # Testes de integração com api.comick.dev
└── src/
    ├── components/              # Navbar, Footer, MangaCard, HistoryDrawer
    ├── pages/                   # HomePage, SearchPage, MangaDetailPage, ReaderPage, FavoritesPage, ApiDocPage
    ├── services/                # api.ts (cliente HTTP) e history.ts (progresso local)
    └── types/                   # manga.ts (modelos canônicos de domínio)
```

---

## 📡 Endpoints da API

| Método | Rota | Descrição | Parâmetros Principais |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/sources` | Lista provedores reais conectados | N/A |
| `GET` | `/api/search` | Busca federada de mangás | `q`, `source`, `genre`, `includeAdult`, `onlyAvailable`, `limit`, `page` |
| `GET` | `/api/manga/featured` | Catálogo e obras em destaque | `limit`, `includeAdult` |
| `GET` | `/api/manga/:id` | Detalhes canônicos de uma obra | ID canônico (`mr_<source>_<id>`) |
| `GET` | `/api/manga/:id/chapters` | Capítulos da obra | `lang`, `order` (`asc`\|`desc`), `deduplicate` (`true`\|`false`) |
| `GET` | `/api/chapters/:id/pages` | Páginas de leitura resolvidas | ID do capítulo (`ch_<source>_<mangaId>_<chapterId>`) |
| `GET` | `/api/chapters/:id/download` | Download de capítulo offline (.cbz / .zip) | `format` (`cbz`\|`zip`) |
| `GET` | `/api/proxy/image` | Proxy reverso de imagens | `url` (URL da imagem codificada) |
| `GET` | `/api/cache/stats` | Estatísticas e métricas de acerto do Cache LRU | N/A |
| `GET` | `/api/health` | Diagnóstico, status do servidor, uptime e telemetria | N/A |
| `GET` | `/api/recommendation-feed` | Feed para motores de recomendação | `limit` |

---

## 💻 Como Executar Localmente

### Pré-requisitos
- **Node.js** v20+ (ou v22+)
- **npm** ou **bun**

### Instalação e Execução
```bash
# 1. Instalar dependências
npm install

# 2. Iniciar servidor de desenvolvimento (Frontend + Backend na porta 3000)
npm run dev

# 3. Executar checagem de tipos (Linter)
npm run lint

# 4. Compilar para produção
npm run build
```

### Execução de Testes
```bash
# Executar suíte de testes determinísticos de contrato (73 asserções locais)
npm test

# Executar testes de fumaça contra MangaDex
npm run test:dex

# Executar testes de fumaça contra Comick
npm run test:comick

# Executar todas as suítes
npm run test:all
```

---

## 🛡️ Licença e Uso de Dados

Este projeto consome APIs públicas abertas e feeds disponibilizados pela comunidade para fins de agregação e leitura. Imagens e direitos autorais pertencem aos seus respectivos autores, editoras e plataformas de origem.
