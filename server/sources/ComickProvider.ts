import { IMangaSource, SourceSearchOptions, SourceSearchResult } from './IMangaSource.js';
import { Manga, Chapter, MangaPage, MangaSourceInfo } from '../../src/types/manga.js';
import { HttpError } from '../errors/HttpError.js';

export class ComickProvider implements IMangaSource {
  private readonly baseUrl = 'https://api.comick.dev';
  private readonly cdnUrl = 'https://meo.comick.pictures';
  private readonly sourceId = 'comick';
  private readonly sourceName = 'Comick (Live API)';

  private readonly headers: Record<string, string> = {
    'User-Agent': 'Tachiyomi/1.10.5',
    'Accept': 'application/json',
    'Referer': 'https://comick.io/'
  };

  getInfo(): MangaSourceInfo {
    return {
      id: this.sourceId,
      name: this.sourceName,
      description: 'Catálogo global de mangás, manhwas e manhuas com capítulos da comunidade em múltiplos idiomas.',
      version: '1.2.0',
      isAvailable: true,
      type: 'live_api',
      websiteUrl: 'https://comick.io',
      supportedFeatures: {
        search: true,
        filters: true,
        coverImages: true,
        multipleLanguages: true,
        chaptersDeduplication: true,
        webtoons: true,
        nsfwFilter: true
      },
      iconColor: '#8b5cf6',
      badge: 'Manhwas & Webtoons',
      languages: ['PT-BR', 'EN', 'ES'],
      catalogEstimate: '+85.000 títulos'
    };
  }

  private async fetchWithTimeout(url: string, timeoutMs = 8000): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response = await fetch(url, {
        signal: controller.signal,
        headers: this.headers
      });

      // Retry on initial Cloudflare connection challenge if 403 is received on new TLS connection
      if (response.status === 403) {
        response = await fetch(url, {
          signal: controller.signal,
          headers: this.headers
        });
      }

      if (!response.ok) {
        if (response.status === 404) {
          throw new HttpError(404, `Recurso não encontrado na API Comick (HTTP 404).`);
        }
        if (response.status === 429) {
          throw new HttpError(429, `Limite de requisições excedido na API Comick (Rate limit 429). Aguarde alguns instantes.`);
        }
        if (response.status === 503) {
          throw new HttpError(503, `Serviço Comick temporariamente indisponível (HTTP 503).`);
        }
        if (response.status === 502 || response.status >= 500) {
          throw new HttpError(502, `Falha no provedor externo Comick: HTTP ${response.status} ${response.statusText}`);
        }
        throw new HttpError(502, `Falha de comunicação com a API Comick: HTTP ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if ((err as Error).name === 'AbortError') {
        throw new HttpError(504, 'Tempo limite de comunicação esgotado com a API Comick (Gateway Timeout).');
      }
      throw new HttpError(502, `Erro ao conectar com a API Comick: ${(err as Error).message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeComickItem(item: any, details?: any): Manga {
    const hid: string = item.hid || item.slug || String(item.id);
    const title: string = item.title || item.slug || 'Sem Título';

    // Alternative titles
    const altTitles: string[] = [];
    const titlesList = item.md_titles || details?.comic?.md_titles || [];
    if (Array.isArray(titlesList)) {
      for (const t of titlesList) {
        if (typeof t === 'string' && !altTitles.includes(t)) {
          altTitles.push(t);
        } else if (t && typeof t.title === 'string' && !altTitles.includes(t.title)) {
          altTitles.push(t.title);
        }
      }
    }

    // Cover image
    let coverUrl = 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80';
    if (item.cover_url && typeof item.cover_url === 'string') {
      coverUrl = item.cover_url;
    } else if (Array.isArray(item.md_covers) && item.md_covers[0]?.b2key) {
      coverUrl = `${this.cdnUrl}/${item.md_covers[0].b2key}`;
    }

    // Authors and Artists
    let authors: string[] = [];
    let artists: string[] = [];

    if (Array.isArray(details?.authors) && details.authors.length > 0) {
      authors = details.authors.map((a: any) => a.name).filter(Boolean);
    } else if (Array.isArray(item.authors) && item.authors.length > 0) {
      authors = item.authors.map((a: any) => a.name).filter(Boolean);
    }

    if (Array.isArray(details?.artists) && details.artists.length > 0) {
      artists = details.artists.map((a: any) => a.name).filter(Boolean);
    } else if (Array.isArray(item.artists) && item.artists.length > 0) {
      artists = item.artists.map((a: any) => a.name).filter(Boolean);
    }

    if (authors.length === 0) authors = ['Autor Desconhecido'];
    if (artists.length === 0) artists = authors;

    // Genres
    const genres: string[] = [];
    const mdGenres = item.md_comic_md_genres || details?.comic?.md_comic_md_genres || [];
    if (Array.isArray(mdGenres)) {
      for (const g of mdGenres) {
        const name = g.md_genres?.name;
        if (name && !genres.includes(name)) {
          genres.push(name);
        }
      }
    }
    if (Array.isArray(item.genres)) {
      for (const g of item.genres) {
        if (typeof g === 'number' || (typeof g === 'string' && !isNaN(Number(g)))) {
          const resolvedName = ComickProvider.GENRE_ID_MAP[String(g)];
          if (resolvedName && !genres.includes(resolvedName)) {
            genres.push(resolvedName);
          }
        } else if (typeof g === 'string' && !genres.includes(g)) {
          genres.push(g);
        } else if (g && typeof g.name === 'string' && !genres.includes(g.name)) {
          genres.push(g.name);
        }
      }
    }
    if (genres.length === 0) {
      genres.push('Manga');
    }

    // Status
    let status: 'ongoing' | 'completed' | 'hiatus' | 'cancelled' = 'ongoing';
    if (item.status === 2) status = 'completed';
    else if (item.status === 3) status = 'cancelled';
    else if (item.status === 4) status = 'hiatus';

    // Synopsis
    const synopsis = item.desc || details?.comic?.desc || 'Sinopse não disponível.';

    // Content rating and adult content detection
    const rawRating = item.content_rating || details?.comic?.content_rating;
    let contentRating: 'safe' | 'suggestive' | 'erotica' | 'pornographic' = 'safe';
    if (rawRating === 'pornographic') contentRating = 'pornographic';
    else if (rawRating === 'erotica') contentRating = 'erotica';
    else if (rawRating === 'suggestive') contentRating = 'suggestive';

    const hasAdultGenre = genres.some(g => /hentai|erotica|smut|adult|doujinshi/i.test(g));
    const isAdult = contentRating === 'pornographic' || contentRating === 'erotica' || hasAdultGenre;

    // Availability detection:
    // In Comick, if item.last_chapter is null, undefined, or 0, there are no chapters uploaded.
    const hasAvailableChapters = item.last_chapter !== null && item.last_chapter !== undefined && Number(item.last_chapter) > 0;
    const availabilityStatus = hasAvailableChapters ? 'available' : 'metadata_only';

    // Demographic mapping (Comick uses integer codes: 1=shounen, 2=shoujo, 3=seinen, 4=josei)
    let demographic: string | undefined;
    if (item.demographic === 1 || item.demographic === '1') demographic = 'shounen';
    else if (item.demographic === 2 || item.demographic === '2') demographic = 'shoujo';
    else if (item.demographic === 3 || item.demographic === '3') demographic = 'seinen';
    else if (item.demographic === 4 || item.demographic === '4') demographic = 'josei';
    else if (typeof item.demographic === 'string') demographic = item.demographic.toLowerCase();

    return {
      id: `mr_${this.sourceId}_${hid}`,
      title,
      altTitles: altTitles.slice(0, 5),
      coverUrl,
      synopsis,
      authors,
      artists,
      genres,
      status,
      publicationInfo: {
        releaseYear: item.year || undefined,
        country: item.country ? String(item.country).toUpperCase() : undefined,
        demographic
      },
      sources: [
        {
          sourceId: this.sourceId,
          sourceName: this.sourceName,
          externalId: hid,
          url: `https://comick.io/comic/${item.slug || hid}`
        }
      ],
      latestChapter: item.last_chapter ? String(item.last_chapter) : undefined,
      updatedAt: item.uploaded_at || item.created_at || new Date().toISOString(),
      contentRating,
      isAdult,
      hasAvailableChapters,
      availabilityStatus
    };
  }

  private static readonly GENRE_ID_MAP: Record<string, string> = {
    "1": "Gender Bender", "2": "Adult", "3": "Mature", "4": "Mahjong", "5": "Adult Cast",
    "6": "Space", "7": "Shounen", "8": "Detective", "9": "Team Sports", "10": "Love Polygon",
    "11": "Visual Arts", "12": "Josei", "13": "Racing", "14": "Seinen", "15": "Suspense",
    "16": "School", "17": "Combat Sports", "18": "Gag Humor", "19": "Avant Garde", "20": "Organized Crime",
    "21": "Vampire", "22": "Gourmet", "23": "Super Power", "24": "Video Game", "25": "Shoujo",
    "26": "Strategy Game", "27": "Mythology", "28": "CGDCT", "29": "Mahou Shoujo", "30": "Urban Fantasy",
    "31": "Girls Love", "32": "Childcare", "33": "Parody", "34": "Showbiz", "35": "Boys Love",
    "36": "Hentai", "37": "Magical Sex Shift", "38": "Otaku Culture", "39": "Workplace", "40": "Iyashikei",
    "41": "Kids", "42": "Performing Arts", "43": "High Stakes Game", "44": "Anthropomorphic", "45": "Idols (Female)",
    "46": "Erotica", "47": "Pets", "48": "Educational", "49": "Idols (Male)", "50": "Love Status Quo",
    "243": "4-Koma", "244": "Action", "245": "Adventure", "246": "Award Winning", "247": "Comedy",
    "248": "Cooking", "249": "Doujinshi", "250": "Drama", "251": "Ecchi", "252": "Fantasy",
    "253": "Gyaru", "254": "Harem", "255": "Historical", "256": "Horror", "257": "Martial Arts",
    "258": "Mecha", "259": "Medical", "260": "Music", "261": "Mystery", "262": "Oneshot",
    "263": "Psychological", "264": "Romance", "265": "School Life", "266": "Sci-Fi", "267": "Shoujo Ai",
    "268": "Shounen Ai", "269": "Slice of Life", "270": "Smut", "271": "Sports", "272": "Supernatural",
    "273": "Tragedy", "274": "Long Strip", "275": "Yaoi", "276": "Yuri", "277": "Video Games",
    "278": "Isekai", "279": "Adaptation", "280": "Anthology", "281": "Web Comic", "282": "Full Color",
    "283": "User Created", "284": "Official Colored", "285": "Fan Colored", "286": "Gore", "287": "Sexual Violence",
    "288": "Crime", "289": "Magical Girls", "290": "Philosophical", "291": "Superhero", "292": "Thriller",
    "293": "Wuxia", "294": "Aliens", "295": "Animals", "296": "Crossdressing", "297": "Demons",
    "298": "Delinquents", "299": "Genderswap", "300": "Ghosts", "301": "Monster Girls", "302": "Loli",
    "303": "Magic", "304": "Military", "305": "Monsters", "306": "Ninja", "307": "Office Workers",
    "308": "Police", "309": "Post-Apocalyptic", "310": "Reincarnation", "311": "Reverse Harem", "312": "Samurai",
    "313": "Shota", "314": "Survival", "315": "Time Travel", "316": "Vampires", "317": "Traditional Games",
    "318": "Virtual Reality", "319": "Zombies", "320": "Incest", "321": "Mafia", "322": "Villainess"
  };

  private static readonly GENRE_MAP: Record<string, string> = {
    // Tropes & Subgêneros Oficiais Comick
    'time travel': 'time-travel',
    'regression': 'time-travel',
    'regressão / tempo': 'time-travel',
    'regressao / tempo': 'time-travel',
    'viagem no tempo': 'time-travel',
    'isekai': 'isekai',
    'reincarnation': 'reincarnation',
    'reencarnação': 'reincarnation',
    'reencarnacao': 'reincarnation',
    'villainess': 'villainess',
    'vilã (villainess)': 'villainess',
    'vilã': 'villainess',
    'vila': 'villainess',
    'psychological': 'psychological',
    'psicológico': 'psychological',
    'psicologico': 'psychological',
    'survival': 'survival',
    'sobrevivência': 'survival',
    'sobrevivencia': 'survival',
    'reverse harem': 'reverse-harem',
    'harem invertido': 'reverse-harem',
    'harem': 'harem',
    'martial arts': 'martial-arts',
    'artes marciais': 'martial-arts',
    'cultivação / murim': 'martial-arts',
    'cultivacao / murim': 'martial-arts',
    'murim': 'martial-arts',
    'magic': 'magic',
    'magia': 'magic',
    'school life': 'school-life',
    'romance colegial': 'school-life',

    // Gêneros Tradicionais
    'ação': 'action',
    'acao': 'action',
    'action': 'action',
    'fantasia': 'fantasy',
    'fantasy': 'fantasy',
    'comédia': 'comedy',
    'comedia': 'comedy',
    'comedy': 'comedy',
    'aventura': 'adventure',
    'adventure': 'adventure',
    'drama': 'drama',
    'sobrenatural': 'supernatural',
    'supernatural': 'supernatural',
    'histórico': 'historical',
    'historico': 'historical',
    'historical': 'historical',
    'horror': 'horror',
    'terror': 'horror',
    'sci-fi': 'sci-fi',
    'ficção científica': 'sci-fi',
    'romance': 'romance',
    'mistério': 'mystery',
    'misterio': 'mystery',
    'mystery': 'mystery',
    'slice of life': 'slice-of-life',
    'cotidiano': 'slice-of-life',
    'sports': 'sports',
    'esportes': 'sports'
  };

  private static readonly KEYWORD_FALLBACKS: Record<string, string> = {
    'overpower (op)': 'overpowered',
    'overpower': 'overpowered',
    'yandere': 'yandere',
    'tomboy': 'tomboy',
    'construção de vila': 'village',
    'construção de vila / reino': 'village',
    'fazenda / agricultura': 'farming',
    'dungeon / sistema': 'dungeon',
    'domador de monstros': 'tamer',
    'vingança': 'revenge'
  };

  async search(query: string, options?: SourceSearchOptions): Promise<SourceSearchResult> {
    try {
      const limit = Math.min(options?.limit || 24, 60);
      const page = options?.page || (options?.offset ? Math.floor(options.offset / limit) + 1 : 1);
      let url = `${this.baseUrl}/v1.0/search?limit=${limit}&page=${page}`;

      let effectiveQuery = query.trim();
      if (!effectiveQuery && options?.genres) {
        for (const g of options.genres) {
          const kw = ComickProvider.KEYWORD_FALLBACKS[g.toLowerCase()];
          if (kw) {
            effectiveQuery = kw;
            break;
          }
        }
      }

      if (effectiveQuery) {
        url += `&q=${encodeURIComponent(effectiveQuery)}`;
      }

      const slugs = new Set<string>();
      if (options?.genre && options.genre !== 'all') {
        const slug = ComickProvider.GENRE_MAP[options.genre.toLowerCase()];
        if (slug) slugs.add(slug);
      }
      if (Array.isArray(options?.genres)) {
        for (const g of options.genres) {
          const slug = ComickProvider.GENRE_MAP[g.toLowerCase()];
          if (slug) slugs.add(slug);
        }
      }
      if (slugs.size > 0) {
        url += `&genres=${encodeURIComponent(Array.from(slugs).join(','))}`;
      }

      if (options?.demographic && options.demographic !== 'all') {
        const demo = options.demographic.toLowerCase();
        if (demo === 'shounen') url += '&demographic=1';
        else if (demo === 'shoujo') url += '&demographic=2';
        else if (demo === 'seinen') url += '&demographic=3';
        else if (demo === 'josei') url += '&demographic=4';
      }

      if (options?.type && options.type !== 'all') {
        const t = options.type.toLowerCase();
        if (t === 'manga') url += '&country=jp';
        else if (t === 'manhwa') url += '&country=kr';
        else if (t === 'manhua') url += '&country=cn';
      }

      if (options?.status && options.status !== 'all') {
        const st = options.status.toLowerCase();
        if (st === 'ongoing') url += '&status=1';
        else if (st === 'completed') url += '&status=2';
        else if (st === 'cancelled') url += '&status=3';
        else if (st === 'hiatus') url += '&status=4';
      }

      const res = await this.fetchWithTimeout(url);
      const list = Array.isArray(res) ? res : [];
      let mangaList: Manga[] = list.map((item: any) => this.normalizeComickItem(item));

      if (!options?.includeAdult) {
        mangaList = mangaList.filter((m: Manga) => !m.isAdult);
      }

      if (options?.onlyAvailable) {
        mangaList = mangaList.filter((m: Manga) => m.hasAvailableChapters);
      }

      return {
        mangaList,
        total: mangaList.length,
        hasMore: mangaList.length >= limit
      };
    } catch (err) {
      console.warn(`[ComickProvider] search failed:`, (err as Error).message);
      return { mangaList: [], total: 0, hasMore: false };
    }
  }

  async getPopular(options?: SourceSearchOptions): Promise<Manga[]> {
    try {
      const limit = Math.min(options?.limit || 24, 60);
      const page = options?.page || (options?.offset ? Math.floor(options.offset / limit) + 1 : 1);
      let url = `${this.baseUrl}/v1.0/search?limit=${limit}&page=${page}`;

      if (options?.genre && options.genre !== 'all') {
        const genreSlug = ComickProvider.GENRE_MAP[options.genre.toLowerCase()];
        if (genreSlug) {
          url += `&genres=${encodeURIComponent(genreSlug)}`;
        }
      }

      const res = await this.fetchWithTimeout(url);
      const list = Array.isArray(res) ? res : [];
      let mangaList: Manga[] = list.map((item: any) => this.normalizeComickItem(item));

      if (!options?.includeAdult) {
        mangaList = mangaList.filter((m: Manga) => !m.isAdult);
      }

      if (options?.onlyAvailable) {
        mangaList = mangaList.filter((m: Manga) => m.hasAvailableChapters);
      }

      return mangaList;
    } catch (err) {
      console.warn(`[ComickProvider] getPopular failed:`, (err as Error).message);
      return [];
    }
  }

  async getMangaDetails(externalId: string): Promise<Manga | null> {
    try {
      const url = `${this.baseUrl}/comic/${externalId}?tachiyomi=true`;
      const res = await this.fetchWithTimeout(url);
      if (!res.comic) return null;
      return this.normalizeComickItem(res.comic, res);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return null;
      if (err instanceof HttpError) throw err;
      console.warn(`[ComickProvider] getMangaDetails failed for ${externalId}:`, (err as Error).message);
      return null;
    }
  }

  async getChapters(externalMangaId: string, language?: string): Promise<Chapter[]> {
    try {
      const buildUrl = (lang: string, pageNum = 1) =>
        `${this.baseUrl}/comic/${externalMangaId}/chapters?lang=${encodeURIComponent(lang)}&limit=100&page=${pageNum}&tachiyomi=true`;

      let list: any[] = [];

      if (language) {
        const res = await this.fetchWithTimeout(buildUrl(language, 1));
        list = Array.isArray(res.chapters) ? res.chapters : [];
        // Fetch next page if total > 100 to provide more chapters
        if (res.total > 100 && list.length === 100) {
          const resPage2 = await this.fetchWithTimeout(buildUrl(language, 2)).catch(() => ({ chapters: [] }));
          if (Array.isArray(resPage2.chapters)) {
            list.push(...resPage2.chapters);
          }
        }
      } else {
        // Default: query pt-br and en preferred translations
        const [resPt, resEn] = await Promise.all([
          this.fetchWithTimeout(buildUrl('pt-br', 1)).catch(() => ({ chapters: [], total: 0 })),
          this.fetchWithTimeout(buildUrl('en', 1)).catch(() => ({ chapters: [], total: 0 }))
        ]);

        const ptList = Array.isArray(resPt.chapters) ? resPt.chapters : [];
        const enList = Array.isArray(resEn.chapters) ? resEn.chapters : [];
        list = [...ptList, ...enList];

        // If English has more chapters (> 100), fetch page 2 to expand chapter coverage
        if (resEn.total > 100 && enList.length === 100) {
          const resEn2 = await this.fetchWithTimeout(buildUrl('en', 2)).catch(() => ({ chapters: [] }));
          if (Array.isArray(resEn2.chapters)) {
            list.push(...resEn2.chapters);
          }
        }

        // Fallback: if both are empty, query without language parameter to fetch any available language
        if (list.length === 0) {
          const fallbackRes = await this.fetchWithTimeout(
            `${this.baseUrl}/comic/${externalMangaId}/chapters?limit=100&page=1&tachiyomi=true`
          ).catch(() => ({ chapters: [] }));
          if (Array.isArray(fallbackRes.chapters) && fallbackRes.chapters.length > 0) {
            list = fallbackRes.chapters;
          }
        }
      }

      return list.map((item: any) => {
        const mdSuffix = item.mdid ? `__md_${item.mdid}` : '';
        const scanGroup = Array.isArray(item.group_name)
          ? item.group_name[0]
          : (item.group_name || (Array.isArray(item.group_names) ? item.group_names[0] : undefined));
        return {
          id: `ch_${this.sourceId}_${externalMangaId}_${item.hid}${mdSuffix}`,
          mangaId: `mr_${this.sourceId}_${externalMangaId}`,
          chapterNumber: item.chap ? String(item.chap) : '1',
          volume: item.vol ? String(item.vol) : undefined,
          title: item.title || undefined,
          releaseDate: item.created_at ? item.created_at.substring(0, 10) : undefined,
          language: item.lang || language || 'en',
          sourceId: this.sourceId,
          externalChapterId: item.hid,
          pagesCount: undefined,
          scanlationGroup: scanGroup || undefined
        };
      });
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.error(`[ComickProvider] Erro ao buscar capítulos para ${externalMangaId}:`, (err as Error).message);
      throw new HttpError(502, `Falha ao obter capítulos da fonte Comick: ${(err as Error).message}`);
    }
  }

  async getChapterPagesResult(externalChapterId: string): Promise<{ pages: MangaPage[]; mdid?: string; comicSlug?: string; chapNum?: string }> {
    try {
      let imagesList: Array<{ b2key?: string }> = [];
      let mdid: string | undefined;
      let comicSlug: string | undefined;
      let chapNum: string | undefined;

      // 1. Try standard chapter details
      try {
        const res = await this.fetchWithTimeout(`${this.baseUrl}/chapter/${externalChapterId}?tachiyomi=true`);
        if (res.chapter?.mdid && typeof res.chapter.mdid === 'string' && res.chapter.mdid.trim().length > 0) {
          mdid = res.chapter.mdid.trim();
        }
        if (res.comic?.slug && typeof res.comic.slug === 'string') {
          comicSlug = res.comic.slug.trim();
        }
        if (res.chapter?.chap !== undefined) {
          chapNum = String(res.chapter.chap).trim();
        }
        if (Array.isArray(res.chapter?.images) && res.chapter.images.length > 0) {
          imagesList = res.chapter.images;
        } else if (Array.isArray(res.chapter?.md_images) && res.chapter.md_images.length > 0) {
          imagesList = res.chapter.md_images;
        } else if (Array.isArray(res.images) && res.images.length > 0) {
          imagesList = res.images;
        }
      } catch (err) {
        if (err instanceof HttpError && (err.status === 404 || err.status === 429)) {
          throw err;
        }
      }

      // 2. Fallback to /get_images endpoint
      if (!imagesList.length) {
        try {
          const imgRes = await this.fetchWithTimeout(`${this.baseUrl}/chapter/${externalChapterId}/get_images`);
          if (Array.isArray(imgRes) && imgRes.length > 0) {
            imagesList = imgRes;
          }
        } catch (err) {
          if (err instanceof HttpError && (err.status === 404 || err.status === 429)) {
            throw err;
          }
        }
      }

      // 3. Fallback to /chapter/{hid} without tachiyomi=true
      if (!imagesList.length) {
        try {
          const rawRes = await this.fetchWithTimeout(`${this.baseUrl}/chapter/${externalChapterId}`);
          if (!mdid && rawRes.chapter?.mdid && typeof rawRes.chapter.mdid === 'string' && rawRes.chapter.mdid.trim().length > 0) {
            mdid = rawRes.chapter.mdid.trim();
          }
          if (!comicSlug && rawRes.comic?.slug) {
            comicSlug = String(rawRes.comic.slug).trim();
          }
          if (!chapNum && rawRes.chapter?.chap !== undefined) {
            chapNum = String(rawRes.chapter.chap).trim();
          }
          if (Array.isArray(rawRes.chapter?.md_images) && rawRes.chapter.md_images.length > 0) {
            imagesList = rawRes.chapter.md_images;
          } else if (Array.isArray(rawRes.chapter?.images) && rawRes.chapter.images.length > 0) {
            imagesList = rawRes.chapter.images;
          }
        } catch {
          // Ignore
        }
      }

      const pages: MangaPage[] = [];
      imagesList.forEach((img: any) => {
        if (!img) return;
        let url = '';
        if (typeof img.url === 'string' && img.url.trim().length > 0) {
          url = img.url.trim();
        } else if (typeof img.b2key === 'string' && img.b2key.trim().length > 0) {
          const key = img.b2key.trim().replace(/^\/+/, '');
          url = key.startsWith('http') ? key : `${this.cdnUrl}/${key}`;
        }
        if (url) {
          pages.push({
            pageNumber: pages.length + 1,
            imageUrl: url
          });
        }
      });

      return {
        pages,
        mdid,
        comicSlug,
        chapNum
      };
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.warn(`[ComickProvider] getChapterPages failed for ${externalChapterId}:`, (err as Error).message);
      throw new HttpError(502, `Falha ao obter páginas do capítulo no Comick: ${(err as Error).message}`);
    }
  }

  async getChapterPages(externalChapterId: string): Promise<MangaPage[]> {
    const result = await this.getChapterPagesResult(externalChapterId);
    return result.pages;
  }
}
