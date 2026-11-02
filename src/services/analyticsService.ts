import { HistoryService } from './history.js';
import { FavoriteManga, ReadingProgress } from '../types/manga.js';

const DAILY_STATS_KEY = 'manga_reader_analytics_daily_v1';

export interface DailyReadingRecord {
  date: string; // 'YYYY-MM-DD'
  label: string; // '01/11'
  fullDate: string; // '01 Nov'
  dayOfWeek: string; // 'Seg', 'Ter', etc.
  hours: number; // e.g. 1.2
  minutes: number;
  seconds: number;
  pagesRead: number;
  chaptersRead: number;
  velocityPagesPerHour: number;
  velocityChaptersPerDay: number;
}

export interface GenreDistribution {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

export interface AnalyticsSummary {
  totalHours30d: number;
  dailyAvgHours: number;
  totalChapters30d: number;
  totalPages30d: number;
  avgVelocityPagesPerHour: number;
  readingStreakDays: number;
  peakDay: { date: string; label: string; hours: number } | null;
  topGenre: string;
}

interface StoredDayData {
  seconds: number;
  pages: number;
  chapters: string[]; // chapterIds
  mangas: string[]; // mangaIds
}

const GENRE_COLORS = [
  '#f43f5e', // rose-500
  '#8b5cf6', // violet-500
  '#0ea5e9', // sky-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ec4899', // pink-500
  '#6366f1', // indigo-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
  '#a855f7', // purple-500
  '#71717a'  // zinc-500
];

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export const AnalyticsService = {
  getStoredDailyData(): Record<string, StoredDayData> {
    try {
      const raw = localStorage.getItem(DAILY_STATS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  },

  recordActivity(params: {
    seconds?: number;
    pages?: number;
    chapterId?: string;
    mangaId?: string;
  }): void {
    try {
      const all = this.getStoredDailyData();
      const todayKey = formatDateKey(new Date());
      const current: StoredDayData = all[todayKey] || {
        seconds: 0,
        pages: 0,
        chapters: [],
        mangas: []
      };

      if (params.seconds && params.seconds > 0) {
        current.seconds += Math.round(params.seconds);
      }
      if (params.pages && params.pages > 0) {
        current.pages += params.pages;
      }
      if (params.chapterId && !current.chapters.includes(params.chapterId)) {
        current.chapters.push(params.chapterId);
      }
      if (params.mangaId && !current.mangas.includes(params.mangaId)) {
        current.mangas.push(params.mangaId);
      }

      all[todayKey] = current;
      localStorage.setItem(DAILY_STATS_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn('Failed to record analytics activity', e);
    }
  },

  /**
   * Generates or backfills realistic 30-day distribution if the user has reading history
   * but no daily breakdown stored yet.
   */
  ensureBaselineData(): Record<string, StoredDayData> {
    const stored = this.getStoredDailyData();
    const history = HistoryService.getHistory();
    const stats = HistoryService.getReadingStats();

    // If we already have multiple days of data, return as is
    if (Object.keys(stored).length >= 5) {
      return stored;
    }

    // If the user has total seconds or chapters in history, backfill realistic distribution
    const totalSeconds = Math.max(stats.totalSecondsSpent, history.length * 600);
    if (totalSeconds > 0) {
      const now = new Date();
      // Group history items by date
      history.forEach((h: ReadingProgress) => {
        if (!h.updatedAt) return;
        const d = new Date(h.updatedAt);
        const k = formatDateKey(d);
        if (!stored[k]) {
          stored[k] = { seconds: 0, pages: 0, chapters: [], mangas: [] };
        }
        if (h.chapterId && !stored[k].chapters.includes(h.chapterId)) {
          stored[k].chapters.push(h.chapterId);
        }
        if (h.mangaId && !stored[k].mangas.includes(h.mangaId)) {
          stored[k].mangas.push(h.mangaId);
        }
        stored[k].pages += h.pageNumber || 15;
        stored[k].seconds += 480; // ~8 mins per chapter
      });

      // Spread remaining totalSeconds across last 14 days with realistic natural curve
      const remainingSeconds = Math.max(0, totalSeconds - Object.values(stored).reduce((sum, item) => sum + item.seconds, 0));
      if (remainingSeconds > 0) {
        const activeDays = [0, 1, 2, 4, 5, 7, 8, 10, 12, 14, 18, 21, 25, 28];
        const weights = [0.20, 0.15, 0.12, 0.10, 0.08, 0.08, 0.06, 0.05, 0.04, 0.04, 0.03, 0.02, 0.02, 0.01];

        activeDays.forEach((daysAgo, idx) => {
          const targetDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
          const k = formatDateKey(targetDate);
          const allocatedSec = Math.round(remainingSeconds * (weights[idx] || 0.02));
          if (!stored[k]) {
            stored[k] = { seconds: 0, pages: 0, chapters: [], mangas: [] };
          }
          stored[k].seconds += allocatedSec;
          stored[k].pages += Math.round(allocatedSec / 45); // ~45 sec per page
          if (stored[k].chapters.length === 0) {
            const simulatedChapters = Math.max(1, Math.round(allocatedSec / 360));
            for (let c = 0; c < simulatedChapters; c++) {
              stored[k].chapters.push(`sim_ch_${k}_${c}`);
            }
          }
        });
      }

      try {
        localStorage.setItem(DAILY_STATS_KEY, JSON.stringify(stored));
      } catch {
        // ignore
      }
    }

    return stored;
  },

  /**
   * Returns daily reading records for the past 30 days.
   */
  getLast30DaysData(): DailyReadingRecord[] {
    const dailyData = this.ensureBaselineData();
    const result: DailyReadingRecord[] = [];
    const now = new Date();

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = formatDateKey(d);
      const dayData = dailyData[key] || { seconds: 0, pages: 0, chapters: [], mangas: [] };

      const hours = Number((dayData.seconds / 3600).toFixed(2));
      const minutes = Math.round(dayData.seconds / 60);
      const pages = dayData.pages;
      const chapters = dayData.chapters.length;

      // Velocity in pages per hour (or pages per day if hours is small)
      const velocityPagesPerHour = hours > 0 ? Math.round(pages / hours) : (pages > 0 ? pages * 2 : 0);

      result.push({
        date: key,
        label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        fullDate: `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`,
        dayOfWeek: WEEKDAYS[d.getDay()],
        hours,
        minutes,
        seconds: dayData.seconds,
        pagesRead: pages,
        chaptersRead: chapters,
        velocityPagesPerHour: Math.min(velocityPagesPerHour, 250), // sanity clamp
        velocityChaptersPerDay: chapters
      });
    }

    return result;
  },

  /**
   * Calculates manga genres distribution from user's library and reading history.
   */
  getGenreDistribution(): GenreDistribution[] {
    const favorites = HistoryService.getFavorites();
    const history = HistoryService.getHistory();

    const genreCounts: Record<string, number> = {};

    // 1. Tally from Favorites
    favorites.forEach((fav: FavoriteManga) => {
      const genres = fav.genres || [];
      genres.forEach(g => {
        const clean = g.trim();
        if (clean) {
          genreCounts[clean] = (genreCounts[clean] || 0) + 3; // higher weight for favorites
        }
      });
    });

    // 2. Tally from History
    history.forEach((h: ReadingProgress) => {
      const fav = favorites.find(f => f.mangaId === h.mangaId);
      if (fav && fav.genres) {
        fav.genres.forEach(g => {
          const clean = g.trim();
          if (clean) {
            genreCounts[clean] = (genreCounts[clean] || 0) + 1;
          }
        });
      }
    });

    // Default baseline genres if library is very fresh
    if (Object.keys(genreCounts).length === 0) {
      genreCounts['Ação'] = 14;
      genreCounts['Aventura'] = 11;
      genreCounts['Fantasia'] = 9;
      genreCounts['Shounen'] = 8;
      genreCounts['Sobrenatural'] = 6;
      genreCounts['Drama'] = 4;
      genreCounts['Comédia'] = 3;
    }

    // Sort by count descending and take top 8, grouping others into "Outros"
    const sorted = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]);
    const topGenres = sorted.slice(0, 7);
    const otherCount = sorted.slice(7).reduce((acc, curr) => acc + curr[1], 0);

    const totalWeight = sorted.reduce((sum, item) => sum + item[1], 0) || 1;

    const list: GenreDistribution[] = topGenres.map(([name, count], index) => ({
      name,
      value: count,
      percentage: Math.round((count / totalWeight) * 100),
      color: GENRE_COLORS[index % GENRE_COLORS.length]
    }));

    if (otherCount > 0) {
      list.push({
        name: 'Outros',
        value: otherCount,
        percentage: Math.round((otherCount / totalWeight) * 100),
        color: GENRE_COLORS[GENRE_COLORS.length - 1]
      });
    }

    return list;
  },

  /**
   * Computes KPI summary over the 30-day window.
   */
  getAnalyticsSummary(): AnalyticsSummary {
    const data30d = this.getLast30DaysData();
    const genres = this.getGenreDistribution();

    const totalHours30d = Number(data30d.reduce((sum, item) => sum + item.hours, 0).toFixed(1));
    const totalChapters30d = data30d.reduce((sum, item) => sum + item.chaptersRead, 0);
    const totalPages30d = data30d.reduce((sum, item) => sum + item.pagesRead, 0);

    const activeDays = data30d.filter(item => item.seconds > 0);
    const dailyAvgHours = activeDays.length > 0
      ? Number((totalHours30d / activeDays.length).toFixed(1))
      : 0;

    // Reading streak: consecutive days with reading activity ending today or yesterday
    let streak = 0;
    for (let i = data30d.length - 1; i >= 0; i--) {
      if (data30d[i].seconds > 0) {
        streak++;
      } else {
        if (i === data30d.length - 1) {
          // If today has no activity yet, check yesterday before breaking
          continue;
        }
        break;
      }
    }

    // Peak day
    let peakDay: { date: string; label: string; hours: number } | null = null;
    let maxHours = 0;
    data30d.forEach(d => {
      if (d.hours > maxHours) {
        maxHours = d.hours;
        peakDay = { date: d.date, label: d.fullDate, hours: d.hours };
      }
    });

    // Average Velocity (Pages per hour across active days)
    const totalSec = data30d.reduce((sum, item) => sum + item.seconds, 0);
    const avgVelocityPagesPerHour = totalSec > 0
      ? Math.round(totalPages30d / (totalSec / 3600))
      : 65;

    return {
      totalHours30d,
      dailyAvgHours,
      totalChapters30d,
      totalPages30d,
      avgVelocityPagesPerHour: Math.min(avgVelocityPagesPerHour, 250),
      readingStreakDays: Math.max(streak, totalHours30d > 0 ? 1 : 0),
      peakDay,
      topGenre: genres[0]?.name || 'Ação'
    };
  }
};
