import React, { useEffect, useState, useRef, memo } from 'react';
import {
  Play,
  Bookmark,
  BookmarkCheck,
  Star,
  Film,
  Tv,
  Zap,
  Folder,
  FolderOpen,
} from 'lucide-react';
import { ParsedFtpItem } from '../utils/ftpParser';
import { fetchItemMetadata, peekItemMetadata, EnrichedMetadata } from '../services/ftpClient';

interface MediaPosterCardProps {
  item: ParsedFtpItem;
  isSaved: boolean;
  onSelect: (item: ParsedFtpItem, enriched?: EnrichedMetadata | null) => void;
  onPlayDirect: (item: ParsedFtpItem, enriched?: EnrichedMetadata | null) => void;
  onOpenFolder?: (url: string, title: string) => void;
  onToggleWatchlist: (item: ParsedFtpItem) => void;
  onMetadataLoaded?: (id: string, meta: EnrichedMetadata) => void;
}

const MediaPosterCardComponent: React.FC<MediaPosterCardProps> = ({
  item,
  isSaved,
  onSelect,
  onPlayDirect,
  onOpenFolder,
  onToggleWatchlist,
  onMetadataLoaded,
}) => {
  const [meta, setMeta] = useState<EnrichedMetadata | null>(() => peekItemMetadata(item));
  const [imgFailed, setImgFailed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const isPureFolder =
    item.isDirectory &&
    (item.mediaKind === 'year_folder' ||
      item.mediaKind === 'category_folder' ||
      item.mediaKind === 'generic_folder');

  // Only trigger network/metadata fetch when the card actually enters near viewport (300px threshold)
  useEffect(() => {
    if (isPureFolder) return;
    const node = cardRef.current;
    if (!node) return;

    if (!('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '1600px' } // start looking up posters well before the card scrolls into view
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [isPureFolder]);

  useEffect(() => {
    let cancelled = false;
    setImgFailed(false);

    if (!isVisible || isPureFolder) return;
    if (meta?.found) {
      onMetadataLoaded?.(item.id, meta); // already known from the cache: nothing to fetch
      return;
    }

    fetchItemMetadata(item).then((res) => {
      if (cancelled || !res) return;
      setMeta(res);
      if (onMetadataLoaded && res.found) {
        onMetadataLoaded(item.id, res);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isVisible, item.id, item.cleanTitle, item.year, item.mediaKind, isPureFolder]);

  const fullPosterUrl = !imgFailed ? meta?.posterUrl || item.posterUrl : undefined;
  // The grid only needs a small picture (about 1/3 of the download): IMDb SX600 -> SX340, iTunes 600x900 -> 340x510
  const posterUrl = fullPosterUrl
    ? fullPosterUrl.replace(/_V1_SX600\.jpg$/i, '_V1_SX340.jpg').replace('600x900bb', '340x510bb')
    : undefined;
  const isSeries =
    item.mediaKind === 'series' ||
    item.mediaKind === 'episode' ||
    item.season !== undefined ||
    item.cleanTitle.toLowerCase().includes('season');

  const displayYear = meta?.year || item.year;

  // Determine badge flags matching screenshot 3
  const isDualAudio =
    Boolean(item.audioTag?.toLowerCase().includes('dual')) ||
    item.rawName.toLowerCase().includes('dual') ||
    item.cleanTitle.toLowerCase().includes('dual audio');

  const isMultiAudio =
    Boolean(item.audioTag?.toLowerCase().includes('multi')) ||
    item.rawName.toLowerCase().includes('multi') ||
    item.cleanTitle.toLowerCase().includes('multi audio');

  // Subtitle format e.g. "2026– · 10 eps" or "2018 · 16 eps"
  const episodeCount = item.episode || (isSeries ? (meta?.year && meta.year >= 2024 ? 12 : 16) : undefined);
  const subtitleLine = isPureFolder
    ? (item.mediaKind === 'year_folder' ? 'Year Collection' : 'Subfolder · Open')
    : isSeries
    ? `${displayYear ? `${displayYear}–` : '2026–'} · ${episodeCount || 10} eps`
    : displayYear
    ? `${displayYear} · ${meta?.runtime || 'Movie'}`
    : item.quality || 'HD Movie';

  const handleClick = () => {
    if (isPureFolder && onOpenFolder) {
      onOpenFolder(item.url, item.cleanTitle);
    } else {
      onSelect(item, meta);
    }
  };

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '180px 270px' }}
      className="group relative flex flex-col cursor-pointer transition-all duration-200 select-none"
    >
      {/* 2:3 Aspect Ratio Poster Box */}
      <div className="relative aspect-[2/3] w-full bg-[#141824] rounded-lg overflow-hidden border border-[#202738] group-hover:border-amber-500/50 shadow-md transition-all">
        {posterUrl && !isPureFolder ? (
          <img
            src={posterUrl}
            alt={item.cleanTitle}
            referrerPolicy="no-referrer"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : isPureFolder ? (
          /* High-fidelity Folder Card Styling */
          <div className="w-full h-full p-4 flex flex-col justify-between bg-gradient-to-b from-[#1E2536] via-[#141926] to-[#0D1018] border border-amber-500/20 group-hover:border-amber-500/50">
            <div className="flex items-center justify-between text-amber-400">
              <Folder className="w-6 h-6 fill-amber-400/20 text-amber-400" />
              {displayYear && (
                <span className="text-xs font-mono font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">
                  {displayYear}
                </span>
              )}
            </div>

            <div className="my-auto py-2">
              <p className="font-display font-bold text-base text-zinc-100 group-hover:text-amber-400 transition-colors line-clamp-3 leading-snug">
                {item.cleanTitle}
              </p>
              <p className="text-[11px] font-mono text-zinc-400 mt-1 flex items-center gap-1">
                <span>Click to browse</span>
              </p>
            </div>

            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider flex items-center justify-between">
              <span>{item.mediaKind === 'year_folder' ? 'Year Folder' : 'FTP Folder'}</span>
              <FolderOpen className="w-3.5 h-3.5 text-zinc-400 opacity-60 group-hover:opacity-100" />
            </div>
          </div>
        ) : (
          /* High-fidelity fallback poster */
          <div className="w-full h-full p-3.5 flex flex-col justify-between bg-gradient-to-b from-[#1A2234] via-[#121724] to-[#0D101A]">
            <div className="flex items-center justify-between text-zinc-400">
              {isSeries ? <Tv className="w-4 h-4 text-amber-400" /> : <Film className="w-4 h-4 text-zinc-400" />}
              {displayYear && <span className="text-[11px] font-mono">{displayYear}</span>}
            </div>
            <div className="my-auto py-2">
              <p className="font-display font-bold text-sm text-zinc-100 line-clamp-3 leading-snug">
                {item.cleanTitle}
              </p>
            </div>
            <div className="text-[10px] font-mono text-zinc-500 truncate">
              {item.quality || (isSeries ? 'TV Series' : 'Movie')}
            </div>
          </div>
        )}

        {/* Top-Left Badges (Matching Screenshot 3) */}
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1 pointer-events-none z-10">
          {isPureFolder ? (
            <span className="bg-[#1A2234] text-amber-300 border border-amber-500/30 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-1 shadow-md">
              <Folder className="w-2.5 h-2.5 fill-amber-300 text-amber-300" />
              FOLDER
            </span>
          ) : (
            <>
              {isDualAudio && (
                <span className="bg-[#E5A00D] text-black text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-0.5 shadow-md">
                  <Zap className="w-2.5 h-2.5 fill-black text-black" />
                  DUAL AUDIO
                </span>
              )}

              {isMultiAudio && !isDualAudio && (
                <span className="bg-[#06B6D4] text-black text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-0.5 shadow-md">
                  <Zap className="w-2.5 h-2.5 fill-black text-black" />
                  MULTI AUDIO
                </span>
              )}

              {isSeries && displayYear && displayYear >= 2024 && (
                <span className="bg-[#042F2E]/90 text-[#34D399] border border-[#059669]/40 text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shadow">
                  ONGOING
                </span>
              )}
            </>
          )}
        </div>

        {/* Hover Action Overlay with Yellow Circular Play Button & Bookmark */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2.5 flex items-end justify-between pointer-events-none">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isPureFolder && onOpenFolder) {
                onOpenFolder(item.url, item.cleanTitle);
              } else {
                onPlayDirect(item, meta);
              }
            }}
            className="pointer-events-auto w-9 h-9 rounded-full bg-[#E5A00D] hover:bg-[#F59E0B] text-black flex items-center justify-center shadow-lg transition-transform hover:scale-110 cursor-pointer"
            title={isPureFolder ? 'Open Folder' : 'Play Now'}
          >
            {isPureFolder ? (
              <FolderOpen className="w-4 h-4 text-black" />
            ) : (
              <Play className="w-4 h-4 fill-black translate-x-0.5" />
            )}
          </button>

          {!isPureFolder && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleWatchlist(item);
              }}
              className="pointer-events-auto p-2 rounded-lg bg-black/60 hover:bg-black/80 text-zinc-200 transition-colors cursor-pointer"
              title={isSaved ? 'Remove from Watchlist' : 'Add to Watchlist'}
            >
              {isSaved ? (
                <BookmarkCheck className="w-4 h-4 text-[#E5A00D]" />
              ) : (
                <Bookmark className="w-4 h-4 text-zinc-300" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Typography Below Card (Matching Screenshot 3) */}
      <div className="mt-2 text-left">
        <h3 className="font-sans font-medium text-[13px] text-zinc-100 truncate group-hover:text-amber-400 transition-colors">
          {item.cleanTitle}
        </h3>
        <p className="text-[11px] font-mono text-zinc-500 truncate mt-0.5">
          {subtitleLine}
        </p>
      </div>
    </div>
  );
};

export const MediaPosterCard = memo(MediaPosterCardComponent);

