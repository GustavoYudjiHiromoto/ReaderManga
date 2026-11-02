import React, { useState, useEffect, useMemo } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import {
  TrendingUp,
  Clock,
  BookOpen,
  PieChart as PieIcon,
  Zap,
  Calendar,
  Sparkles,
  Flame,
  Award,
  ChevronRight,
  Filter,
  BarChart3
} from 'lucide-react';
import {
  AnalyticsService,
  DailyReadingRecord,
  GenreDistribution,
  AnalyticsSummary
} from '../services/analyticsService.js';
import { HistoryService } from '../services/history.js';

interface ReadingAnalyticsProps {
  className?: string;
  onExploreGenre?: (genre: string) => void;
}

// Custom Glassmorphism Tooltip for Area / Bar Chart
const HoursTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data: DailyReadingRecord = payload[0].payload;
    return (
      <div className="rounded-xl bg-zinc-950/95 border border-zinc-700/80 p-3 shadow-2xl backdrop-blur-md text-xs z-50">
        <p className="font-bold text-zinc-200 border-b border-zinc-800 pb-1 mb-2 flex items-center justify-between gap-4">
          <span>{data.fullDate} ({data.dayOfWeek})</span>
          <span className="text-[10px] text-zinc-500 font-mono">{data.date}</span>
        </p>
        <div className="space-y-1.5 font-mono">
          <div className="flex items-center justify-between gap-3 text-rose-400">
            <span className="flex items-center gap-1.5 font-sans text-zinc-400">
              <Clock className="h-3 w-3 text-rose-400" /> Tempo Lido:
            </span>
            <span className="font-bold">{data.hours}h ({data.minutes}m)</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-emerald-400">
            <span className="flex items-center gap-1.5 font-sans text-zinc-400">
              <BookOpen className="h-3 w-3 text-emerald-400" /> Capítulos:
            </span>
            <span className="font-bold">{data.chaptersRead} caps</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-amber-400">
            <span className="flex items-center gap-1.5 font-sans text-zinc-400">
              <Sparkles className="h-3 w-3 text-amber-400" /> Páginas:
            </span>
            <span className="font-bold">{data.pagesRead} págs</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

// Custom Tooltip for Velocity Chart
const VelocityTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data: DailyReadingRecord = payload[0].payload;
    return (
      <div className="rounded-xl bg-zinc-950/95 border border-zinc-700/80 p-3 shadow-2xl backdrop-blur-md text-xs z-50 font-mono">
        <p className="font-bold font-sans text-zinc-200 border-b border-zinc-800 pb-1 mb-2">
          {data.fullDate} • Ritmo de Leitura
        </p>
        <div className="space-y-1">
          <p className="text-emerald-400 font-bold flex items-center justify-between gap-4">
            <span className="text-zinc-400 font-sans">Velocidade:</span>
            <span>{data.velocityPagesPerHour} pág/hora</span>
          </p>
          <p className="text-violet-400 flex items-center justify-between gap-4">
            <span className="text-zinc-400 font-sans">Capítulos no dia:</span>
            <span>{data.chaptersRead} caps</span>
          </p>
          <p className="text-zinc-400 flex items-center justify-between gap-4">
            <span className="text-zinc-500 font-sans">Tempo total:</span>
            <span>{data.hours}h</span>
          </p>
        </div>
      </div>
    );
  }
  return null;
};

// Custom Tooltip for Genre Pie Chart
const GenreTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data: GenreDistribution = payload[0].payload;
    return (
      <div className="rounded-xl bg-zinc-950/95 border border-zinc-700/80 p-2.5 shadow-2xl backdrop-blur-md text-xs z-50">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.color }} />
          <span className="font-bold text-white">{data.name}</span>
        </div>
        <div className="text-[11px] text-zinc-400 space-y-0.5">
          <p>Representa <span className="font-bold text-zinc-200 font-mono">{data.percentage}%</span> da sua biblioteca</p>
          <p>Peso total: <span className="text-zinc-300 font-mono">{data.value} pontos</span></p>
        </div>
      </div>
    );
  }
  return null;
};

export const ReadingAnalytics: React.FC<ReadingAnalyticsProps> = ({
  className = '',
  onExploreGenre
}) => {
  const [timeRange, setTimeRange] = useState<'30d' | '14d' | '7d'>('30d');
  const [hoursMetric, setHoursMetric] = useState<'hours' | 'pages'>('hours');
  const [activeGenreIndex, setActiveGenreIndex] = useState<number | null>(null);

  const [dailyData30d, setDailyData30d] = useState<DailyReadingRecord[]>(() =>
    AnalyticsService.getLast30DaysData()
  );
  const [genreDist, setGenreDist] = useState<GenreDistribution[]>(() =>
    AnalyticsService.getGenreDistribution()
  );
  const [summary, setSummary] = useState<AnalyticsSummary>(() =>
    AnalyticsService.getAnalyticsSummary()
  );

  const refreshAnalytics = () => {
    setDailyData30d(AnalyticsService.getLast30DaysData());
    setGenreDist(AnalyticsService.getGenreDistribution());
    setSummary(AnalyticsService.getAnalyticsSummary());
  };

  useEffect(() => {
    refreshAnalytics();
    const unsubHistory = HistoryService.subscribe(() => {
      refreshAnalytics();
    });
    return unsubHistory;
  }, []);

  // Filter dataset according to selected range
  const filteredData = useMemo(() => {
    const sliceCount = timeRange === '7d' ? 7 : timeRange === '14d' ? 14 : 30;
    return dailyData30d.slice(dailyData30d.length - sliceCount);
  }, [dailyData30d, timeRange]);

  // Compute average velocity for reference line
  const avgVelocity = useMemo(() => {
    const active = filteredData.filter(d => d.velocityPagesPerHour > 0);
    if (active.length === 0) return 60;
    const sum = active.reduce((acc, curr) => acc + curr.velocityPagesPerHour, 0);
    return Math.round(sum / active.length);
  }, [filteredData]);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Analytics Main Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-rose-500/20 via-violet-500/20 to-amber-500/20 border border-rose-500/30 text-rose-400 shadow-inner">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Reading Analytics
              </h2>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                Últimos 30 Dias
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Horas dedicadas, velocidade de leitura e distribuição de gêneros em tempo real
            </p>
          </div>
        </div>

        {/* Range Selector Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-950/80 border border-zinc-800 self-start sm:self-auto text-xs">
          {(['7d', '14d', '30d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                timeRange === range
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-950/50 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              {range === '7d' ? '7 Dias' : range === '14d' ? '14 Dias' : '30 Dias'}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Top KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Total Hours */}
        <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 hover:border-rose-500/30 transition-all group">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
            <span>Horas Totais (30d)</span>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 group-hover:scale-110 transition-transform">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono tabular-nums">
              {summary.totalHours30d}
            </span>
            <span className="text-xs text-zinc-500 font-medium">horas</span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            Média de <strong className="text-zinc-300 font-mono">~{summary.dailyAvgHours}h</strong> por dia ativo
          </p>
        </div>

        {/* Reading Velocity */}
        <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 hover:border-emerald-500/30 transition-all group">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
            <span>Velocidade Média</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
              <Zap className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono tabular-nums">
              {summary.avgVelocityPagesPerHour}
            </span>
            <span className="text-xs text-zinc-500 font-medium">pág/hora</span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            <strong className="text-zinc-300 font-mono">{summary.totalChapters30d}</strong> capítulos concluídos
          </p>
        </div>

        {/* Favorite Genre */}
        <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 hover:border-violet-500/30 transition-all group">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
            <span>Gênero Dominante</span>
            <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-400 group-hover:scale-110 transition-transform">
              <Award className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-extrabold text-white truncate">
              {summary.topGenre}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            {genreDist[0]?.percentage || 0}% do seu volume de leitura
          </p>
        </div>

        {/* Reading Streak */}
        <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 hover:border-amber-500/30 transition-all group">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
            <span>Sequência de Leitura</span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 group-hover:scale-110 transition-transform">
              <Flame className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-amber-400 font-mono tabular-nums">
              {summary.readingStreakDays}
            </span>
            <span className="text-xs text-zinc-500 font-medium">
              {summary.readingStreakDays === 1 ? 'dia consecutivo' : 'dias consecutivos'}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            {summary.peakDay
              ? `Pico em ${summary.peakDay.label}: ${summary.peakDay.hours}h lidas`
              : 'Continue lendo para manter a chama!'}
          </p>
        </div>
      </div>

      {/* Primary Chart 1: Hours / Volume Over Time */}
      <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-zinc-800/70">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="h-4 w-4 text-rose-400" />
              <span>Tempo de Leitura por Dia ({timeRange.toUpperCase()})</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Horas e minutos gastos na leitura nos últimos {timeRange === '7d' ? '7' : timeRange === '14d' ? '14' : '30'} dias
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto text-xs">
            <div className="flex items-center p-1 rounded-lg bg-zinc-950 border border-zinc-800">
              <button
                onClick={() => setHoursMetric('hours')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                  hoursMetric === 'hours'
                    ? 'bg-rose-600 text-white font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Horas Lidas
              </button>
              <button
                onClick={() => setHoursMetric('pages')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                  hoursMetric === 'pages'
                    ? 'bg-rose-600 text-white font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Páginas Lidas
              </button>
            </div>
          </div>
        </div>

        {/* Recharts Area / Bar Chart */}
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            {hoursMetric === 'hours' ? (
              <AreaChart data={filteredData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="hoursGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#71717a"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#3f3f46' }}
                />
                <YAxis
                  stroke="#71717a"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#3f3f46' }}
                  unit="h"
                />
                <Tooltip content={<HoursTooltip />} />
                <Area
                  type="monotone"
                  dataKey="hours"
                  stroke="#f43f5e"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#hoursGradient)"
                  activeDot={{ r: 6, fill: '#f43f5e', stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            ) : (
              <BarChart data={filteredData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#71717a"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#3f3f46' }}
                />
                <YAxis
                  stroke="#71717a"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#3f3f46' }}
                />
                <Tooltip content={<HoursTooltip />} />
                <Bar
                  dataKey="pagesRead"
                  fill="#f43f5e"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Grid: Chart 2 (Genres Distribution) & Chart 3 (Reading Velocity) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Chart 2: Manga Genres Distribution (Donut Chart) */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800/70">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <PieIcon className="h-4 w-4 text-violet-400" />
                  <span>Distribuição de Gêneros</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Preferências calculadas a partir das suas leituras e favoritos
                </p>
              </div>
            </div>

            {/* Donut Chart container */}
            <div className="relative h-60 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<GenreTooltip />} />
                  <Pie
                    data={genreDist}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    onMouseEnter={(_, index) => setActiveGenreIndex(index)}
                    onMouseLeave={() => setActiveGenreIndex(null)}
                  >
                    {genreDist.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color}
                        stroke="#18181b"
                        strokeWidth={2}
                        className="transition-all duration-200 cursor-pointer hover:opacity-80"
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              {/* Central text label in Donut */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                  Top Gênero
                </span>
                <span className="text-sm font-extrabold text-white truncate max-w-[100px]">
                  {activeGenreIndex !== null && genreDist[activeGenreIndex]
                    ? genreDist[activeGenreIndex].name
                    : summary.topGenre}
                </span>
                <span className="text-[11px] font-mono text-zinc-400">
                  {activeGenreIndex !== null && genreDist[activeGenreIndex]
                    ? `${genreDist[activeGenreIndex].percentage}%`
                    : `${genreDist[0]?.percentage || 0}%`}
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Genre Legend Pills */}
          <div className="mt-4 pt-3 border-t border-zinc-800/60 flex flex-wrap gap-1.5">
            {genreDist.map((g, idx) => (
              <button
                key={g.name}
                type="button"
                onClick={() => onExploreGenre?.(g.name)}
                onMouseEnter={() => setActiveGenreIndex(idx)}
                onMouseLeave={() => setActiveGenreIndex(null)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                  activeGenreIndex === idx
                    ? 'border-zinc-500 bg-zinc-800 text-white scale-105'
                    : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
                title={`Explorar obras do gênero ${g.name}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                <span>{g.name}</span>
                <span className="text-[10px] font-mono text-zinc-500">({g.percentage}%)</span>
              </button>
            ))}
          </div>
        </div>

        {/* Chart 3: Reading Velocity Over Last 30 Days */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-zinc-800/70">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap className="h-4 w-4 text-emerald-400" />
                  <span>Velocidade de Leitura (Páginas / Hora)</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Velocidade e consistência diária ao longo dos últimos {timeRange === '7d' ? '7' : timeRange === '14d' ? '14' : '30'} dias
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Média: {avgVelocity} pág/h
                </span>
              </div>
            </div>

            {/* Recharts Line Chart */}
            <div className="h-64 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={filteredData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#71717a"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#3f3f46' }}
                  />
                  <YAxis
                    stroke="#71717a"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#3f3f46' }}
                    unit=" p/h"
                  />
                  <Tooltip content={<VelocityTooltip />} />
                  <ReferenceLine
                    y={avgVelocity}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="velocityPagesPerHour"
                    name="Velocidade"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#10b981' }}
                    activeDot={{ r: 6, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="chaptersRead"
                    name="Capítulos"
                    stroke="#8b5cf6"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Velocity Insights Bar */}
          <div className="mt-4 pt-3 border-t border-zinc-800/60 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-emerald-400"></span>
                <span>Páginas por hora</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-violet-400 border-b border-dashed border-violet-400"></span>
                <span>Capítulos lidos</span>
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">
              Taxa média saudável: ~60-90 páginas/hora
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};
