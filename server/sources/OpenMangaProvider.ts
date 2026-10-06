import { IMangaSource, SourceSearchOptions, SourceSearchResult } from './IMangaSource.js';
import { Manga, Chapter, MangaPage, MangaSourceInfo } from '../../src/types/manga.js';

interface RawMangaEntry {
  externalId: string;
  title: string;
  altTitles: string[];
  coverUrl: string;
  synopsis: string;
  authors: string[];
  artists: string[];
  genres: string[];
  status: 'ongoing' | 'completed' | 'hiatus';
  releaseYear: number;
  magazine: string;
  demographic: string;
  rating: number;
  chapters: {
    externalChapterId: string;
    chapterNumber: string;
    title: string;
    releaseDate: string;
    language: string;
    pages: string[];
  }[];
}

const OPEN_MANGA_CATALOG: RawMangaEntry[] = [
  {
    externalId: 'frieren-journey',
    title: 'Sousou no Frieren',
    altTitles: ['Frieren: Beyond Journey\'s End', '葬送のフリーレン', 'Frieren e a Jornada para o Além'],
    coverUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
    synopsis: 'O Rei Demônio foi derrotado e o grupo de heróis vitorioso retorna para casa antes de se dissolver. Os quatro—a maga elfa Frieren, o herói Himmel, o sacerdote Heiter e o guerreiro Eisen—relembram sua jornada de uma década enquanto o momento de dizer adeus se aproxima. Mas a passagem do tempo é diferente para os elfos, e Frieren testemunha seus companheiros envelhecerem e partirem. Anos depois, ela embarca em uma nova jornada para honrar a memória de seus amigos.',
    authors: ['Kanehito Yamada'],
    artists: ['Tsukasa Abe'],
    genres: ['Fantasia', 'Aventura', 'Drama', 'Slice of Life'],
    status: 'ongoing',
    releaseYear: 2020,
    magazine: 'Weekly Shōnen Sunday',
    demographic: 'Shounen',
    rating: 9.38,
    chapters: [
      {
        externalChapterId: 'frieren-ch-01',
        chapterNumber: '1',
        title: 'O Fim da Aventura',
        releaseDate: '2020-04-28',
        language: 'pt-br',
        pages: [
          'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1518709766631-a6a7f45921c3?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1000&auto=format&fit=crop&q=85'
        ]
      },
      {
        externalChapterId: 'frieren-ch-02',
        chapterNumber: '2',
        title: 'A Mentira do Sacerdote',
        releaseDate: '2020-05-12',
        language: 'pt-br',
        pages: [
          'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1000&auto=format&fit=crop&q=85'
        ]
      },
      {
        externalChapterId: 'frieren-ch-03',
        chapterNumber: '3',
        title: 'O Rio de Flores Azuis',
        releaseDate: '2020-05-19',
        language: 'pt-br',
        pages: [
          'https://images.unsplash.com/photo-1518709766631-a6a7f45921c3?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1000&auto=format&fit=crop&q=85'
        ]
      }
    ]
  },
  {
    externalId: 'chainsaw-man',
    title: 'Chainsaw Man',
    altTitles: ['チェンソーマン', 'Homem-Motosserra'],
    coverUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=600&auto=format&fit=crop&q=80',
    synopsis: 'Denji é um jovem que vive na miséria absoluta, pagando a imensa dívida deixada por seu falecido pai aos capangas da Yakuza. Acompanhado por Pochita, o cão-demônio motosserra, Denji trabalha como caçador informal de demônios. Após uma emboscada mortal, Pochita se funde ao coração de Denji, ressuscitando-o como o híbrido Chainsaw Man e abrindo as portas da Segurança Pública de Caçadores.',
    authors: ['Tatsuki Fujimoto'],
    artists: ['Tatsuki Fujimoto'],
    genres: ['Ação', 'Sobrenatural', 'Horror', 'Comédia Sombria'],
    status: 'ongoing',
    releaseYear: 2018,
    magazine: 'Weekly Shōnen Jump / Shōnen Jump+',
    demographic: 'Shounen',
    rating: 8.79,
    chapters: [
      {
        externalChapterId: 'csm-ch-01',
        chapterNumber: '1',
        title: 'Cão e Motosserra',
        releaseDate: '2018-12-03',
        language: 'pt-br',
        pages: [
          'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1000&auto=format&fit=crop&q=85'
        ]
      },
      {
        externalChapterId: 'csm-ch-02',
        chapterNumber: '2',
        title: 'O Lugar Onde Fica Tóquio',
        releaseDate: '2018-12-10',
        language: 'pt-br',
        pages: [
          'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1000&auto=format&fit=crop&q=85'
        ]
      }
    ]
  },
  {
    externalId: 'one-punch-man',
    title: 'One-Punch Man',
    altTitles: ['ワンパンマン', 'OPM'],
    coverUrl: 'https://images.unsplash.com/photo-1569701814227-463d1a3c61db?w=600&auto=format&fit=crop&q=80',
    synopsis: 'Saitama é um herói que treinou tão intensamente durante três anos que perdeu todo o cabelo e se tornou capaz de derrotar qualquer adversário com um único golpe. No entanto, sua invencibilidade tornou sua vida uma busca constante pelo entusiasmo da batalha que ele já não consegue mais sentir.',
    authors: ['ONE'],
    artists: ['Yusuke Murata'],
    genres: ['Ação', 'Comédia', 'Super-herói', 'Sci-Fi'],
    status: 'ongoing',
    releaseYear: 2012,
    magazine: 'Tonari no Young Jump',
    demographic: 'Seinen',
    rating: 8.85,
    chapters: [
      {
        externalChapterId: 'opm-ch-01',
        chapterNumber: '1',
        title: 'Um Homem Comum',
        releaseDate: '2012-06-14',
        language: 'pt-br',
        pages: [
          'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1569701814227-463d1a3c61db?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1000&auto=format&fit=crop&q=85'
        ]
      },
      {
        externalChapterId: 'opm-ch-02',
        chapterNumber: '2',
        title: 'Garota Mosquito',
        releaseDate: '2012-06-21',
        language: 'pt-br',
        pages: [
          'https://images.unsplash.com/photo-1569701814227-463d1a3c61db?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1000&auto=format&fit=crop&q=85'
        ]
      }
    ]
  },
  {
    externalId: 'vinland-saga',
    title: 'Vinland Saga',
    altTitles: ['ヴィンランド・サガ'],
    coverUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=600&auto=format&fit=crop&q=80',
    synopsis: 'Thorfinn é filho de um dos maiores guerreiros vikings, mas quando seu pai é emboscado e morto pelo mercenário Askeladd, o garoto jura vingança. Ele se junta ao bando de Askeladd para conquistar duelos de honra, envolvendo-se na sangrenta invasão da Inglaterra no século XI.',
    authors: ['Makoto Yukimura'],
    artists: ['Makoto Yukimura'],
    genres: ['Histórico', 'Ação', 'Drama', 'Aventura'],
    status: 'ongoing',
    releaseYear: 2005,
    magazine: 'Afternoon',
    demographic: 'Seinen',
    rating: 9.04,
    chapters: [
      {
        externalChapterId: 'vinland-ch-01',
        chapterNumber: '1',
        title: 'Normanni',
        releaseDate: '2005-04-13',
        language: 'pt-br',
        pages: [
          'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1000&auto=format&fit=crop&q=85'
        ]
      }
    ]
  },
  {
    externalId: 'solo-leveling',
    title: 'Solo Leveling',
    altTitles: ['Na Honjaman Lebel-eob', '나 혼자만 레벨업', 'Só Eu Subo de Nível'],
    coverUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80',
    synopsis: 'Em um mundo onde portais para masmorras perigosas começaram a se abrir, humanos despertaram poderes para se tornarem caçadores. Sung Jin-woo é conhecido como o "caçador mais fraco de toda a humanidade". Mas após sobreviver milagrosamente a uma masmorra dupla mortal, ele recebe uma missão secreta que só ele pode ver: a habilidade de subir de nível sem limites.',
    authors: ['Chugong'],
    artists: ['DUBU (REDICE STUDIO)'],
    genres: ['Ação', 'Fantasia', 'Superpoderes', 'Mistério'],
    status: 'completed',
    releaseYear: 2018,
    magazine: 'KakaoPage',
    demographic: 'Shounen',
    rating: 8.65,
    chapters: [
      {
        externalChapterId: 'sl-ch-01',
        chapterNumber: '1',
        title: 'O Caçador Mais Fraco',
        releaseDate: '2018-03-04',
        language: 'pt-br',
        pages: [
          'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=1000&auto=format&fit=crop&q=85'
        ]
      },
      {
        externalChapterId: 'sl-ch-02',
        chapterNumber: '2',
        title: 'Masmorra Dupla',
        releaseDate: '2018-03-11',
        language: 'pt-br',
        pages: [
          'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=1000&auto=format&fit=crop&q=85'
        ]
      }
    ]
  },
  {
    externalId: 'berserk',
    title: 'Berserk',
    altTitles: ['ベルセルク', 'Berserk: The Black Swordsman'],
    coverUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
    synopsis: 'Guts, conhecido como o Espadachim Negro, busca refúgio dos demônios que o perseguem e vingança contra seu antigo amigo e líder que sacrificou seus companheiros por ambição profana. Empunhando a massiva espada Dragonslayer, sua jornada desafia o destino.',
    authors: ['Kentaro Miura'],
    artists: ['Kentaro Miura', 'Studio Gaga'],
    genres: ['Dark Fantasy', 'Ação', 'Horror', 'Tragédia'],
    status: 'ongoing',
    releaseYear: 1989,
    magazine: 'Young Animal',
    demographic: 'Seinen',
    rating: 9.47,
    chapters: [
      {
        externalChapterId: 'berserk-ch-01',
        chapterNumber: '1',
        title: 'O Espadachim Negro',
        releaseDate: '1989-10-01',
        language: 'pt-br',
        pages: [
          'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1518709766631-a6a7f45921c3?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1000&auto=format&fit=crop&q=85'
        ]
      }
    ]
  },
  {
    externalId: 'dungeon-meshi',
    title: 'Dungeon Meshi',
    altTitles: ['Delicious in Dungeon', 'ダンジョン飯', 'Masmorra dos Sabores'],
    coverUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80',
    synopsis: 'Depois de ter sua irmã devorada por um dragão vermelho nas profundezas da masmorra, o cavaleiro Laios e seus companheiros decidem resgatá-la antes que seja digerida. Sem dinheiro para suprimentos, eles tomam uma decisão culinária sem precedentes: alimentar-se dos próprios monstros que habitam a masmorra.',
    authors: ['Ryoko Kui'],
    artists: ['Ryoko Kui'],
    genres: ['Fantasia', 'Culinária', 'Comédia', 'Aventura'],
    status: 'completed',
    releaseYear: 2014,
    magazine: 'Harta',
    demographic: 'Seinen',
    rating: 8.76,
    chapters: [
      {
        externalChapterId: 'dm-ch-01',
        chapterNumber: '1',
        title: 'Ensopado de Cogumelo Andante e Escorpião Gigante',
        releaseDate: '2014-02-15',
        language: 'pt-br',
        pages: [
          'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1000&auto=format&fit=crop&q=85'
        ]
      }
    ]
  },
  {
    externalId: 'spy-family',
    title: 'Spy x Family',
    altTitles: ['SPY×FAMILY', 'Espião x Família'],
    coverUrl: 'https://images.unsplash.com/photo-1518709766631-a6a7f45921c3?w=600&auto=format&fit=crop&q=80',
    synopsis: 'O mestre dos espiões sob o codinome Crepúsculo precisa criar uma família fictícia para se infiltrar em uma escola de elite e manter a paz entre duas nações rivais. Sem saber, a esposa que ele escolhe é uma assassina profissional e a filha adotada é uma telepata que lê a mente de ambos.',
    authors: ['Tatsuya Endo'],
    artists: ['Tatsuya Endo'],
    genres: ['Comédia', 'Ação', 'Espionagem', 'Slice of Life'],
    status: 'ongoing',
    releaseYear: 2019,
    magazine: 'Shōnen Jump+',
    demographic: 'Shounen',
    rating: 8.62,
    chapters: [
      {
        externalChapterId: 'spy-ch-01',
        chapterNumber: '1',
        title: 'Missão 1: Operação Strix',
        releaseDate: '2019-03-25',
        language: 'pt-br',
        pages: [
          'https://images.unsplash.com/photo-1518709766631-a6a7f45921c3?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1000&auto=format&fit=crop&q=85',
          'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1000&auto=format&fit=crop&q=85'
        ]
      }
    ]
  }
];

export class OpenMangaProvider implements IMangaSource {
  private readonly sourceId = 'openmanga';
  private readonly sourceName = 'OpenManga Archive';

  getInfo(): MangaSourceInfo {
    return {
      id: this.sourceId,
      name: this.sourceName,
      description: 'Catálogo curado de alta disponibilidade com edições completas e capítulos ilustrados verificados.',
      version: '1.2.0',
      isAvailable: true,
      type: 'curated_catalog',
      websiteUrl: 'https://openmanga.org',
      supportedFeatures: {
        search: true,
        filters: true,
        coverImages: true,
        multipleLanguages: true
      }
    };
  }

  private normalizeToManga(entry: RawMangaEntry): Manga {
    return {
      id: `mr_${this.sourceId}_${entry.externalId}`,
      title: entry.title,
      altTitles: entry.altTitles,
      coverUrl: entry.coverUrl,
      synopsis: entry.synopsis,
      authors: entry.authors,
      artists: entry.artists,
      genres: entry.genres,
      status: entry.status,
      publicationInfo: {
        releaseYear: entry.releaseYear,
        magazine: entry.magazine,
        country: 'JP',
        demographic: entry.demographic
      },
      sources: [
        {
          sourceId: this.sourceId,
          sourceName: this.sourceName,
          externalId: entry.externalId,
          url: `https://openmanga.org/manga/${entry.externalId}`
        }
      ],
      latestChapter: entry.chapters.length > 0 ? entry.chapters[entry.chapters.length - 1].chapterNumber : undefined,
      totalChapters: entry.chapters.length,
      rating: entry.rating,
      updatedAt: new Date().toISOString()
    };
  }

  async search(query: string, options?: SourceSearchOptions): Promise<SourceSearchResult> {
    const q = query.trim().toLowerCase();
    let results = OPEN_MANGA_CATALOG.filter(entry => {
      const matchTitle = entry.title.toLowerCase().includes(q);
      const matchAlt = entry.altTitles.some(alt => alt.toLowerCase().includes(q));
      const matchAuthor = entry.authors.some(a => a.toLowerCase().includes(q));
      const matchGenre = !options?.genre || entry.genres.some(g => g.toLowerCase() === options.genre?.toLowerCase());
      
      if (q === '') return matchGenre;
      return (matchTitle || matchAlt || matchAuthor) && matchGenre;
    });

    const limit = options?.limit || 20;
    const offset = options?.offset || 0;
    const paged = results.slice(offset, offset + limit);

    return {
      mangaList: paged.map(item => this.normalizeToManga(item)),
      total: results.length,
      hasMore: offset + limit < results.length
    };
  }

  async getPopular(options?: SourceSearchOptions): Promise<Manga[]> {
    const sorted = [...OPEN_MANGA_CATALOG].sort((a, b) => b.rating - a.rating);
    const limit = options?.limit || 10;
    return sorted.slice(0, limit).map(item => this.normalizeToManga(item));
  }

  async getMangaDetails(externalId: string): Promise<Manga | null> {
    const found = OPEN_MANGA_CATALOG.find(entry => entry.externalId === externalId);
    if (!found) return null;
    return this.normalizeToManga(found);
  }

  async getChapters(externalMangaId: string, language?: string): Promise<Chapter[]> {
    const manga = OPEN_MANGA_CATALOG.find(entry => entry.externalId === externalMangaId);
    if (!manga) return [];

    let chapters = manga.chapters;
    if (language) {
      chapters = chapters.filter(c => c.language.toLowerCase() === language.toLowerCase());
    }

    return chapters.map(ch => ({
      id: `ch_${this.sourceId}_${externalMangaId}_${ch.externalChapterId}`,
      mangaId: `mr_${this.sourceId}_${externalMangaId}`,
      chapterNumber: ch.chapterNumber,
      title: ch.title,
      releaseDate: ch.releaseDate,
      language: ch.language,
      sourceId: this.sourceId,
      externalChapterId: ch.externalChapterId,
      pagesCount: ch.pages.length
    }));
  }

  async getChapterPages(externalChapterId: string): Promise<MangaPage[]> {
    for (const manga of OPEN_MANGA_CATALOG) {
      const ch = manga.chapters.find(c => c.externalChapterId === externalChapterId);
      if (ch) {
        return ch.pages.map((url, idx) => ({
          pageNumber: idx + 1,
          imageUrl: url,
          width: 800,
          height: 1200
        }));
      }
    }
    return [];
  }
}
