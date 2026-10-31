import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ChevronDown,
  Filter,
  Loader2,
  AlertCircle,
  RefreshCw,
  FolderOpen,
  ArrowLeft,
  Layers,
  Sparkles,
  Film,
  Tv,
  ChevronRight,
} from 'lucide-react';
import { ParsedFtpItem } from '../utils/ftpParser';
import { EnrichedMetadata, sortNewestFirst } from '../services/ftpClient';
import { MediaPosterCard } from './MediaPosterCard';
import { NetflixHome } from './NetflixHome';

interface BreadcrumbItem {
  label: string;
  url: string;
}

interface CatalogViewProps {
  title: string;
  items: ParsedFtpItem[];
  isLoading: boolean;
  isDeepScanning?: boolean;
  deepScanProgressText?: string;
  breadcrumbs?: BreadcrumbItem[];
  onNavigateBreadcrumb?: (index: number) => void;
  onOpenFolder?: (url: string, title: string) => void;
  onRefresh?: () => void;
  onSelectMedia: (item: ParsedFtpItem, meta?: EnrichedMetadata | null) => void;
  onPlayDirect: (item: ParsedFtpItem, meta?: EnrichedMetadata | null) => void;
  watchlistSet: Set<string>;
  onToggleWatchlist: (item: ParsedFtpItem) => void;
  isUnpackMode?: boolean;
  onToggleUnpackMode?: () => void;
  hasSubfolders?: boolean;
  isHome?: boolean;
  onNavigateSection?: (section: 'movies' | 'series') => void;
}

const CHUNK_SIZE = 64;

export const CatalogView: React.FC<CatalogViewProps> = ({
  title,
  items,
  isLoading,
  isDeepScanning,
  deepScanProgressText,
  breadcrumbs = [],
  onNavigateBreadcrumb,
  onOpenFolder,
  onRefresh,
  onSelectMedia,
  onPlayDirect,
  watchlistSet,
  onToggleWatchlist,
  isUnpackMode = true,
  onToggleUnpackMode,
  hasSubfolders = false,
  isHome = false,
  onNavigateSection,
}) => {
  const [selectedIndustry, setSelectedIndustry] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedAudio, setSelectedAudio] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('recent');
  const [homeTab, setHomeTab] = useState<'netflix' | 'two-sections' | 'movies' | 'series'>('netflix');

  // Progressive rendering window (keeps DOM lightweight and 60fps smooth even with 15,000 items)
  const [visibleCount, setVisibleCount] = useState<number>(CHUNK_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Industry / Category matching (Hollywood, Bollywood, South, Korean, Animation, Bangla)
  const matchIndustry = (item: ParsedFtpItem, ind: string): boolean => {
    if (ind === 'all') return true;
    const src = (item.sourceServerName || '').toLowerCase();
    const url = (item.url || '').toLowerCase();
    const raw = (item.rawName || '').toLowerCase();
    const clean = (item.cleanTitle || '').toLowerCase();

    if (ind === 'hollywood') {
      return (
        src.includes('english') ||
        url.includes('english') ||
        url.includes('foreign language') ||
        (!url.includes('hindi') && !url.includes('south') && !url.includes('korean') && !url.includes('bangla'))
      );
    }
    if (ind === 'bollywood') {
      return (
        src.includes('hindi movies') ||
        (url.includes('hindi') && !url.includes('south indian') && !url.includes('hindi dubbed')) ||
        raw.includes('bollywood')
      );
    }
    if (ind === 'south') {
      return (
        src.includes('south') ||
        src.includes('dubbed') ||
        url.includes('south indian') ||
        url.includes('hindi dubbed') ||
        raw.includes('south') ||
        raw.includes('tamil') ||
        raw.includes('telugu') ||
        raw.includes('malayalam') ||
        raw.includes('kannada')
      );
    }
    if (ind === 'korean') {
      return (
        src.includes('korean') ||
        src.includes('anime') ||
        url.includes('korean') ||
        url.includes('anime') ||
        raw.includes('korean')
      );
    }
    if (ind === 'animation') {
      return (
        src.includes('animation') ||
        src.includes('anime') ||
        url.includes('animation') ||
        raw.includes('animation') ||
        raw.includes('animated')
      );
    }
    if (ind === 'bangla') {
      return (
        src.includes('bangla') ||
        src.includes('kolkata') ||
        url.includes('bangla') ||
        url.includes('kolkata') ||
        raw.includes('bangla')
      );
    }
    return true;
  };

  // Dynamic Genre matching
  const matchGenre = (item: ParsedFtpItem, genre: string): boolean => {
    if (genre === 'all') return true;
    const target = genre.toLowerCase();

    if (Array.isArray(item.genres) && item.genres.length > 0) {
      if (item.genres.some((g) => g.toLowerCase().includes(target))) return true;
    }

    const text = `${item.cleanTitle} ${item.rawName} ${item.plot || ''}`.toLowerCase();
    if (text.includes(target)) return true;

    if (target === 'action') {
      return /\b(action|war|fight|mission|combat|agent|police|commando|gangster|gun|furious)\b/i.test(text);
    }
    if (target === 'comedy') {
      return /\b(comedy|funny|humor|laugh|joke|comic|family)\b/i.test(text);
    }
    if (target === 'romance') {
      return /\b(romance|romantic|love|story|kiss|wedding|dil|pyaar|prem|ishq)\b/i.test(text);
    }
    if (target === 'thriller') {
      return /\b(thriller|mystery|crime|detective|investigation|suspense|murder|killer|heist|psycho)\b/i.test(text);
    }
    if (target === 'horror') {
      return /\b(horror|ghost|bhoot|chudail|evil|curse|demon|dark|dead|fear|creepy)\b/i.test(text);
    }
    if (target === 'animation') {
      return /\b(animation|animated|anime|cartoon|disney|pixar|dreamworks)\b/i.test(text) || text.includes('animation');
    }
    if (target === 'drama') {
      return /\b(drama|family|life|emotional|struggle|bio|true|affair)\b/i.test(text);
    }
    if (target === 'sci-fi') {
      return /\b(sci-fi|sci fi|scifi|science|alien|space|future|robot|cyber|avatar)\b/i.test(text);
    }
    return false;
  };

  // Filter items
  const filteredItems = useMemo(() => {
    let result = items.filter((item) => {
      // Ignore subtitle or metadata noise in main catalog
      if (item.mediaKind === 'subtitle') return false;

      // Industry filter
      if (!matchIndustry(item, selectedIndustry)) return false;

      // Genre filter
      if (!matchGenre(item, selectedGenre)) return false;

      // Year filter
      if (selectedYear !== 'all') {
        if (selectedYear === '2026' && item.year !== 2026) return false;
        if (selectedYear === '2025' && item.year !== 2025) return false;
        if (selectedYear === '2024' && item.year !== 2024) return false;
        if (selectedYear === 'older' && item.year && item.year >= 2024) return false;
      }

      // Audio filter
      if (selectedAudio === 'dual') {
        const isDual =
          Boolean(item.audioTag?.toLowerCase().includes('dual')) ||
          item.rawName.toLowerCase().includes('dual') ||
          item.cleanTitle.toLowerCase().includes('dual audio');
        if (!isDual) return false;
      } else if (selectedAudio === 'multi') {
        const isMulti =
          Boolean(item.audioTag?.toLowerCase().includes('multi')) ||
          item.rawName.toLowerCase().includes('multi');
        if (!isMulti) return false;
      }

      // Status filter
      if (selectedStatus === 'ongoing') {
        const isOngoing = item.year && item.year >= 2024;
        if (!isOngoing) return false;
      }

      return true;
    });

    // Sorting (Defaults to 'recent' / newest first!)
    if (sortBy === 'title') {
      result = [...result].sort((a, b) => a.cleanTitle.localeCompare(b.cleanTitle));
    } else if (sortBy === 'year-asc') {
      result = [...result].sort((a, b) => (a.year || 0) - (b.year || 0));
    } else {
      // Default: 'recent' or 'year-desc' -> Newest releases (2026, 2025, 2024...) first!
      result = sortNewestFirst(result);
    }

    return result;
  }, [items, selectedIndustry, selectedYear, selectedGenre, selectedAudio, selectedStatus, sortBy]);

  // Reset window whenever filters or dataset change
  useEffect(() => {
    setVisibleCount(CHUNK_SIZE);
  }, [items.length, selectedIndustry, selectedYear, selectedGenre, selectedStatus, selectedAudio, sortBy]);

  // Observer sentinel for buttery smooth infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + CHUNK_SIZE, filteredItems.length));
        }
      },
      { rootMargin: '600px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredItems.length]);

  // Split items for Home two-section view
  const movieItems = useMemo(() => {
    return filteredItems.filter(
      (item) =>
        item.mediaKind === 'movie' ||
        (!item.isDirectory && item.season === undefined && item.episode === undefined && !/series|season|drama|show/i.test(item.url))
    );
  }, [filteredItems]);

  const seriesItems = useMemo(() => {
    return filteredItems.filter(
      (item) =>
        item.mediaKind === 'series' ||
        item.mediaKind === 'episode' ||
        item.season !== undefined ||
        /series|season|drama|show/i.test(item.url)
    );
  }, [filteredItems]);

  const displayedItems = useMemo(() => {
    if (isHome && homeTab === 'movies') {
      return movieItems.slice(0, visibleCount);
    }
    if (isHome && homeTab === 'series') {
      return seriesItems.slice(0, visibleCount);
    }
    return filteredItems.slice(0, visibleCount);
  }, [filteredItems, movieItems, seriesItems, isHome, homeTab, visibleCount]);

  // Cinema Home Mode: Full-bleed cinematic layout with new movies hero spotlight and category carousels
  if (isHome && homeTab === 'netflix' && breadcrumbs.length <= 1) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#090A0F]">
        <NetflixHome
          items={items}
          isLoading={isLoading}
          onSelectMedia={onSelectMedia}
          onPlayDirect={onPlayDirect}
          onOpenFolder={onOpenFolder}
          watchlistSet={watchlistSet}
          onToggleWatchlist={onToggleWatchlist}
          onNavigateSection={onNavigateSection}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5 select-none bg-[#090A0F] text-zinc-100 pb-24">
      {/* Breadcrumb Navigation when drilling into subfolders */}
      {breadcrumbs.length > 1 && onNavigateBreadcrumb && (
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 bg-[#10141E] px-3.5 py-2 rounded-lg border border-[#1C2333] w-fit">
          <button
            onClick={() => onNavigateBreadcrumb(breadcrumbs.length - 2)}
            className="flex items-center gap-1 hover:text-amber-400 transition-colors cursor-pointer mr-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
          <span>/</span>
          {breadcrumbs.map((b, idx) => (
            <React.Fragment key={b.url}>
              {idx > 0 && <span className="text-zinc-600">/</span>}
              <button
                onClick={() => onNavigateBreadcrumb(idx)}
                className={`hover:text-amber-400 transition-colors cursor-pointer truncate max-w-[160px] ${
                  idx === breadcrumbs.length - 1 ? 'text-amber-400 font-semibold' : ''
                }`}
              >
                {b.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Page Header (Matching Screenshot 3) */}
      <div className="space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-bold text-xl sm:text-2xl text-white tracking-tight">
              {title}
            </h2>
            <p className="text-xs font-mono text-zinc-500 mt-0.5">
              {filteredItems.length.toLocaleString()}{' '}
              {title.toLowerCase().includes('series') || title.toLowerCase().includes('tv') || title.toLowerCase().includes('shows')
                ? 'series & shows'
                : title.toLowerCase().includes('movie')
                ? 'movies'
                : 'items'}
              {isUnpackMode &&
                (title.toLowerCase().includes('series') || title.toLowerCase().includes('tv') || title.toLowerCase().includes('shows')
                  ? ' (All Seasons Indexed)'
                  : ' (Unpacked from all subfolders)')}
            </p>
          </div>

          {/* Auto-Unpack Status / Toggle */}
          {hasSubfolders && onToggleUnpackMode && (
            <button
              onClick={onToggleUnpackMode}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-2 transition-all cursor-pointer border self-start sm:self-auto ${
                isUnpackMode
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
                  : 'bg-[#151B28] hover:bg-[#1E273A] text-zinc-400 border-zinc-700/50'
              }`}
              title={
                title.toLowerCase().includes('series') || title.toLowerCase().includes('tv')
                  ? 'Click to toggle between indexed series and raw folder structure'
                  : 'Click to toggle between all unpacked movies and raw folder structure'
              }
            >
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {isUnpackMode
                  ? title.toLowerCase().includes('series') || title.toLowerCase().includes('tv')
                    ? '✓ Auto-Indexed (All Series)'
                    : '✓ Auto-Unpacked (All Movies)'
                  : '📁 Raw Folders Mode'}
              </span>
            </button>
          )}
        </div>

        {/* Home Mode Section Switcher */}
        {isHome && (
          <div className="flex items-center gap-1.5 p-1 bg-[#10141E] rounded-xl border border-white/5 w-fit text-xs flex-wrap">
            <button
              onClick={() => setHomeTab('netflix')}
              className="px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 bg-amber-500/15 text-amber-300 hover:bg-amber-500 hover:text-black border border-amber-500/30"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Cinema Spotlight Home</span>
            </button>
            <button
              onClick={() => setHomeTab('two-sections')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                homeTab === 'two-sections'
                  ? 'bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>2 Sections (Movies & Series)</span>
            </button>
            <button
              onClick={() => setHomeTab('movies')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                homeTab === 'movies'
                  ? 'bg-white/15 text-white font-semibold'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Movies ({movieItems.length.toLocaleString()})</span>
            </button>
            <button
              onClick={() => setHomeTab('series')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                homeTab === 'series'
                  ? 'bg-white/15 text-white font-semibold'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>TV Series ({seriesItems.length.toLocaleString()})</span>
            </button>
          </div>
        )}

        {/* Deep Scan Loading Indicator */}
        {isDeepScanning && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3 text-xs text-amber-300">
            <Loader2 className="w-4 h-4 animate-spin text-amber-400 shrink-0" />
            <span className="font-mono">
              {deepScanProgressText || 'Scanning subfolders and unpacking all movies...'}
            </span>
          </div>
        )}

        {/* Filters and Sorters Bar (Matching Screenshot 3) */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs">
          {/* Left Dropdown Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Industry / Origin Dropdown */}
            <div className="relative">
              <select
                value={selectedIndustry}
                onChange={(e) => setSelectedIndustry(e.target.value)}
                className="appearance-none bg-[#121620] border border-[#1E2536] hover:border-zinc-500 rounded-lg pl-3 pr-8 py-1.5 text-xs text-amber-300 font-medium focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
              >
                <option value="all">All Industries</option>
                <option value="hollywood">Hollywood (English)</option>
                <option value="bollywood">Bollywood (Hindi)</option>
                <option value="south">South Indian (Dubbed)</option>
                <option value="korean">Korean & Asian</option>
                <option value="animation">Animation Movies</option>
                <option value="bangla">Bangla Movies</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            </div>

            {/* Genre Dropdown */}
            <div className="relative">
              <select
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value)}
                className="appearance-none bg-[#121620] border border-[#1E2536] hover:border-zinc-600 rounded-lg pl-3 pr-8 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
              >
                <option value="all">Any genre</option>
                <option value="action">Action & Adventure</option>
                <option value="comedy">Comedy</option>
                <option value="drama">Drama</option>
                <option value="romance">Romance</option>
                <option value="thriller">Thriller & Crime</option>
                <option value="horror">Horror & Mystery</option>
                <option value="animation">Animation & Anime</option>
                <option value="sci-fi">Sci-Fi & Fantasy</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            </div>

            {/* Year Dropdown */}
            <div className="relative">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="appearance-none bg-[#121620] border border-[#1E2536] hover:border-zinc-600 rounded-lg pl-3 pr-8 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
              >
                <option value="all">Any year</option>
                <option value="2026">2026</option>
                <option value="2025">2025</option>
                <option value="2024">2024</option>
                <option value="older">2023 & Earlier</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            </div>

            {/* Audio Dropdown */}
            <div className="relative">
              <select
                value={selectedAudio}
                onChange={(e) => setSelectedAudio(e.target.value)}
                className="appearance-none bg-[#121620] border border-[#1E2536] hover:border-zinc-600 rounded-lg pl-3 pr-8 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
              >
                <option value="all">Any audio</option>
                <option value="dual">Dual Audio</option>
                <option value="multi">Multi Audio</option>
                <option value="original">Original Audio</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            </div>

            {/* Status Dropdown */}
            <div className="relative">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="appearance-none bg-[#121620] border border-[#1E2536] hover:border-zinc-600 rounded-lg pl-3 pr-8 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
              >
                <option value="all">Any status</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          {/* Right Sort Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 text-xs font-mono hidden sm:inline">Sort</span>
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none bg-[#121620] border border-[#1E2536] hover:border-zinc-600 rounded-lg pl-3 pr-8 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-500 transition-colors cursor-pointer font-medium"
              >
                <option value="recent">Recently updated</option>
                <option value="year-desc">Year (Newest first)</option>
                <option value="year-asc">Year (Oldest first)</option>
                <option value="title">Title (A — Z)</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Loading Spinner */}
      {isLoading && items.length === 0 && (
        <div className="py-24 flex flex-col items-center justify-center gap-3 text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          <p className="text-xs font-mono">Scanning FTP directory & resolving stream items...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredItems.length === 0 && (
        <div className="py-20 text-center space-y-3 bg-[#11141E] border border-white/5 rounded-xl p-8 max-w-lg mx-auto">
          <FolderOpen className="w-10 h-10 text-zinc-500 mx-auto" />
          <h3 className="font-semibold text-zinc-200">No media found for this filter</h3>
          <p className="text-xs text-zinc-400">
            Try resetting your filters or check your server connection in Settings.
          </p>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="mt-3 px-4 py-2 bg-[#1C2230] hover:bg-[#252D3F] text-zinc-200 text-xs rounded-lg transition-colors cursor-pointer"
            >
              Rescan Server
            </button>
          )}
        </div>
      )}

      {/* HOME: TWO DISTINCT SECTIONS (Movies Section & Series Section) */}
      {isHome && homeTab === 'two-sections' ? (
        <div className="space-y-8 pt-1">
          {/* Section 1: Movies */}
          {movieItems.length > 0 && (
            <section className="space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Film className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-base sm:text-lg text-white">
                      Featured & Trending Movies
                    </h3>
                    <p className="text-[11px] text-zinc-400 font-mono">
                      {movieItems.length.toLocaleString()} movies available
                    </p>
                  </div>
                </div>
                {onNavigateSection && (
                  <button
                    onClick={() => onNavigateSection('movies')}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold cursor-pointer group px-2.5 py-1 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <span>View all movies</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-3 sm:gap-4">
                {movieItems.slice(0, 16).map((item) => (
                  <MediaPosterCard
                    key={item.id}
                    item={item}
                    isSaved={watchlistSet.has(item.id)}
                    onSelect={onSelectMedia}
                    onPlayDirect={onPlayDirect}
                    onOpenFolder={onOpenFolder}
                    onToggleWatchlist={onToggleWatchlist}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Section 2: TV Shows & Series */}
          {seriesItems.length > 0 && (
            <section className="space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <Tv className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-base sm:text-lg text-white">
                      Popular TV Shows & Web Series
                    </h3>
                    <p className="text-[11px] text-zinc-400 font-mono">
                      {seriesItems.length.toLocaleString()} series available
                    </p>
                  </div>
                </div>
                {onNavigateSection && (
                  <button
                    onClick={() => onNavigateSection('series')}
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold cursor-pointer group px-2.5 py-1 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <span>View all series</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-3 sm:gap-4">
                {seriesItems.slice(0, 16).map((item) => (
                  <MediaPosterCard
                    key={item.id}
                    item={item}
                    isSaved={watchlistSet.has(item.id)}
                    onSelect={onSelectMedia}
                    onPlayDirect={onPlayDirect}
                    onOpenFolder={onOpenFolder}
                    onToggleWatchlist={onToggleWatchlist}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        /* Standard Single Grid (All Movies, All TV Shows, or Filtered Single Tab) */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-3 sm:gap-4">
          {displayedItems.map((item) => (
            <MediaPosterCard
              key={item.id}
              item={item}
              isSaved={watchlistSet.has(item.id)}
              onSelect={onSelectMedia}
              onPlayDirect={onPlayDirect}
              onOpenFolder={onOpenFolder}
              onToggleWatchlist={onToggleWatchlist}
            />
          ))}
        </div>
      )}

      {/* Progressive Infinite Scroll Sentinel for 60fps Smooth Browsing */}
      {(!isHome || homeTab !== 'two-sections') && visibleCount < filteredItems.length && (
        <div
          ref={sentinelRef}
          className="w-full py-8 flex flex-col items-center justify-center gap-2 text-xs font-mono text-zinc-500"
        >
          <div className="flex items-center gap-2 text-amber-400">
            <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            <span>Loading more titles smoothly...</span>
          </div>
          <span className="text-[11px] text-zinc-500">
            Showing {Math.min(visibleCount, filteredItems.length).toLocaleString()} of{' '}
            {filteredItems.length.toLocaleString()} titles
          </span>
        </div>
      )}
    </div>
  );
};
