import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Play,
  ListPlus,
  Bookmark,
  BookmarkCheck,
  Share2,
  Star,
  Check,
  Tv,
  Film,
  Calendar,
  Clock,
  HardDrive,
  Loader2,
  Download,
  FileVideo,
  Volume2,
  Copy,
  ExternalLink,
  Info,
  Radio,
} from 'lucide-react';
import { ParsedFtpItem } from '../utils/ftpParser';
import { withTimeout } from '../utils/withTimeout';
import { useGuide, episodeName, EpisodeThumb } from '../mobile/episodeGuide';
import {
  SeasonFolderInfo,
  crawlSeriesSeasons,
  loadSeasonEpisodes,
  resolvePlayableFromFolder,
  saveCachedPlayableUrl,
  getCachedPlayableUrl,
  EnrichedMetadata,
} from '../services/ftpClient';

interface MediaDetailViewProps {
  item: ParsedFtpItem;
  enrichedMeta?: EnrichedMetadata | null;
  onBack: () => void;
  onPlayItem: (
    videoItem: ParsedFtpItem,
    playlist: ParsedFtpItem[],
    subtitles: ParsedFtpItem[],
    seasons?: SeasonFolderInfo[]
  ) => void;
  isSaved: boolean;
  onToggleWatchlist: (item: ParsedFtpItem) => void;
  watchedEpisodeIds?: Set<string>;
}

export const MediaDetailView: React.FC<MediaDetailViewProps> = ({
  item,
  enrichedMeta,
  onBack,
  onPlayItem,
  isSaved,
  onToggleWatchlist,
  watchedEpisodeIds = new Set(),
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Series state
  const [seasons, setSeasons] = useState<SeasonFolderInfo[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [episodes, setEpisodes] = useState<ParsedFtpItem[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const guide = useGuide((item.cleanTitle || item.rawName).split(' · ')[0]);
  const [activeEpisodeId, setActiveEpisodeId] = useState<string | null>(null);

  // Movie folder resolution state
  const [resolvedMovie, setResolvedMovie] = useState<ParsedFtpItem | null>(null);
  const [movieFiles, setMovieFiles] = useState<ParsedFtpItem[]>([]);
  const [subtitles, setSubtitles] = useState<ParsedFtpItem[]>([]);

  // Strictly distinguish Series from Movies:
  // Movies (Hollywood, Bollywood, South, Bangla, Animation, etc.) are MOVIES, NEVER TV series!
  const isMovieSource =
    item.mediaKind === 'movie' ||
    /english\s*movies|hindi\s*movies|bangla|south\s*indian|kolkata|hollywood|bollywood|tollywood|animation\s*movies/i.test(item.sourceServerName || '') ||
    /english%20movies|hindi%20movies|bangla|south%20indian|kolkata|animation%20movies/i.test(item.url || '');

  const isSeries =
    !isMovieSource &&
    (item.mediaKind === 'series' ||
      item.mediaKind === 'episode' ||
      (item.season !== undefined && item.season > 0) ||
      /\b(season\s*\d|s0[1-9]|s[1-9]\d)\b/i.test(item.rawName) ||
      /\b(tv\s*series|web\s*series)\b/i.test(item.rawName) ||
      /tv-series|web-series|foreign-tv/i.test(item.url));

  // Load either TV Series seasons or Movie files
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(false);

    if (isSeries) {
      withTimeout(crawlSeriesSeasons(item), 40000, 'server timeout')
        .then((res) => {
          if (cancelled) return;
          setSeasons(res.seasons);
          if (res.seasons.length > 0) {
            const firstSeason = res.seasons[0];
            setSelectedSeasonId(firstSeason.id);
            setEpisodes(res.initialEpisodes);
            setSubtitles(res.initialSubtitles);
            if (res.initialEpisodes.length > 0) {
              setActiveEpisodeId(res.initialEpisodes[0].id);
            }
          }
        })
        .catch((err) => {
          console.warn('Error crawling seasons:', err);
          if (!cancelled) setLoadError(true);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    } else {
      // It's a Movie (either direct video file or unpacked folder)
      const isFolder =
        item.isDirectory ||
        item.url.endsWith('/') ||
        !/\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(item.url);

      if (!isFolder) {
        setResolvedMovie(item);
        setMovieFiles([item]);
        setIsLoading(false);
      } else {
        const cached = getCachedPlayableUrl(item.id) || getCachedPlayableUrl(item.url);
        if (cached) {
          const directItem: ParsedFtpItem = {
            ...item,
            url: cached,
            isDirectory: false,
          };
          setResolvedMovie(directItem);
          setMovieFiles([directItem]);
          setIsLoading(false);
        } else {
          withTimeout(resolvePlayableFromFolder(item), 40000, 'server timeout')
            .then((res) => {
              if (cancelled) return;
              if (res.primaryVideo && !res.primaryVideo.isDirectory && /\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(res.primaryVideo.url)) {
                saveCachedPlayableUrl(item.id, res.primaryVideo.url);
                saveCachedPlayableUrl(item.url, res.primaryVideo.url);
                setResolvedMovie(res.primaryVideo);
                setMovieFiles(res.allVideos.length > 0 ? res.allVideos : [res.primaryVideo]);
              } else if (res.allVideos.length > 0) {
                const first = res.allVideos[0];
                saveCachedPlayableUrl(item.id, first.url);
                saveCachedPlayableUrl(item.url, first.url);
                setResolvedMovie(first);
                setMovieFiles(res.allVideos);
              } else {
                setResolvedMovie(null);
                setMovieFiles([]);
              }
              setSubtitles(res.subtitles || []);
            })
            .catch((err) => {
              console.warn('Error resolving movie folder:', err);
              if (!cancelled) {
                setLoadError(true);
                setResolvedMovie(null);
                setMovieFiles([]);
              }
            })
            .finally(() => {
              if (!cancelled) setIsLoading(false);
            });
        }
      }
    }

    return () => {
      cancelled = true;
    };
  }, [item.id, item.url, isSeries, retryTick]);

  const handleSelectSeason = async (season: SeasonFolderInfo) => {
    setSelectedSeasonId(season.id);
    if (season.episodes && season.episodes.length > 0) {
      setEpisodes(season.episodes);
      setSubtitles(season.subtitles || []);
      if (season.episodes.length > 0) setActiveEpisodeId(season.episodes[0].id);
      return;
    }

    setIsLoading(true);
    try {
      const loaded = await loadSeasonEpisodes(season, item);
      season.episodes = loaded.episodes;
      season.subtitles = loaded.subtitles;
      setEpisodes(loaded.episodes);
      setSubtitles(loaded.subtitles);
      if (loaded.episodes.length > 0) setActiveEpisodeId(loaded.episodes[0].id);
    } finally {
      setIsLoading(false);
    }
  };

  const effectivePlayable = isSeries
    ? episodes.find((e) => e.id === activeEpisodeId) || episodes[0] || item
    : resolvedMovie || item;

  const rawPlayUrl = effectivePlayable.url;
  const safeDirectUrl = rawPlayUrl.startsWith('http://server') && rawPlayUrl.includes('.ftpbd.net')
    ? rawPlayUrl.replace(/^http:\/\//i, 'https://')
    : rawPlayUrl;

  const posterUrl = enrichedMeta?.posterUrl || item.posterUrl;
  const backdropUrl = enrichedMeta?.backdropUrl || posterUrl;
  const rating = enrichedMeta?.imdbRating || item.imdbRating;
  const yearStr = enrichedMeta?.year
    ? isSeries
      ? `${enrichedMeta.year}–`
      : `${enrichedMeta.year}`
    : item.year
    ? isSeries
      ? `${item.year}–`
      : `${item.year}`
    : '';

  const genres =
    enrichedMeta?.genres && enrichedMeta.genres.length > 0
      ? enrichedMeta.genres
      : item.genres && item.genres.length > 0
      ? item.genres
      : ['Cinema', item.quality || '1080p'];

  const plot =
    enrichedMeta?.plot ||
    item.plot ||
    (isSeries
      ? 'Stream full TV series seasons and episodes directly from high-speed FTP storage with multi-audio selection.'
      : 'Watch this movie in high definition with direct FTP streaming, hardware-accelerated playback, and multi-audio support.');

  const tagline = enrichedMeta?.tagline;
  const director = enrichedMeta?.director;
  const cast = enrichedMeta?.cast || item.cast;

  const handleCopyLink = () => {
    try {
      navigator.clipboard.writeText(safeDirectUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  };

  // Movie technical specs
  const filename = effectivePlayable.rawName || item.rawName;
  const ext = filename.split('.').pop()?.toUpperCase() || (filename.includes('.mkv') ? 'MKV' : 'MP4');
  const sizeFormatted = effectivePlayable.sizeFormatted || item.sizeFormatted || '1.6 GB';

  return (
    <div className="flex-1 overflow-y-auto bg-[#090A0F] text-zinc-100 select-none pb-24">
      {/* Top Back Navigation Breadcrumb */}
      <div className="px-4 sm:px-8 py-3.5 flex items-center justify-between border-b border-[#161B24] text-xs font-medium text-zinc-400">
        <button
          onClick={onBack}
          className="flex items-center gap-2 hover:text-white transition-colors cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform text-amber-400" />
          <span>Back to {isSeries ? 'TV Shows' : 'Movies'}</span>
        </button>

        <div className="flex items-center gap-2 text-zinc-500 font-mono text-[11px]">
          <span>{isSeries ? 'Series Catalog' : 'Movie Vault'}</span>
          <span>·</span>
          <span className="text-zinc-400">{item.sourceServerName || 'CineFTP'}</span>
        </div>
      </div>

      {/* Cinematic Hero Backdrop Section */}
      <div className="relative w-full border-b border-[#161B24] overflow-hidden bg-[#0D1017]">
        {/* Blurred Backdrop Image with Scrim */}
        {backdropUrl && (
          <div className="absolute inset-0 z-0 pointer-events-none">
            <img
              src={backdropUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-center opacity-30 filter blur-sm scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#090A0F] via-[#090A0F]/85 to-[#090A0F]/50" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#090A0F] via-[#090A0F]/80 to-transparent" />
          </div>
        )}

        {/* Content Container */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-9 flex flex-col md:flex-row gap-6 sm:gap-8 items-center md:items-start">
          {/* Left Poster */}
          <div className="w-44 sm:w-56 md:w-64 shrink-0 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-[#121622] mx-auto md:mx-0 group relative">
            {posterUrl ? (
              <img
                src={posterUrl}
                alt={item.cleanTitle}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="w-full h-full p-5 flex flex-col justify-between bg-gradient-to-br from-[#1C2333] to-[#0E121B]">
                {isSeries ? <Tv className="w-10 h-10 text-amber-400" /> : <Film className="w-10 h-10 text-amber-400" />}
                <span className="font-display font-bold text-lg text-white">
                  {item.cleanTitle}
                </span>
              </div>
            )}
            <div className="absolute top-2.5 left-2.5">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider font-mono uppercase bg-black/70 backdrop-blur-md text-amber-400 border border-amber-500/30">
                {isSeries ? 'TV Series' : 'Movie'}
              </span>
            </div>
          </div>

          {/* Right Media Details */}
          <div className="flex-1 space-y-3.5 w-full">
            <h1 className="font-display font-bold text-2xl sm:text-4xl text-white tracking-tight leading-tight text-center md:text-left">
              {item.cleanTitle}
            </h1>

            {/* Badges & Meta Row */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              {yearStr && (
                <span className="text-zinc-300 font-semibold bg-[#1C2230] px-2.5 py-0.5 rounded border border-white/10">
                  {yearStr}
                </span>
              )}

              {rating && (
                <span className="flex items-center gap-1 text-amber-400 font-bold bg-[#1E1A10] px-2.5 py-0.5 rounded border border-amber-500/20">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  {rating}
                </span>
              )}

              <span className="bg-[#1C2230] text-zinc-300 px-2.5 py-0.5 rounded border border-white/5 font-semibold">
                {effectivePlayable.quality || item.quality || '1080p'}
              </span>

              {isSeries ? (
                <span className="text-zinc-400 font-sans text-xs">
                  {seasons.length > 0 ? `${seasons.length} season${seasons.length > 1 ? 's' : ''}` : '1 season'} ·{' '}
                  {episodes.length > 0 ? `${episodes.length} episodes` : 'Episodes available'}
                </span>
              ) : (
                <>
                  <span className="bg-[#07303E] text-[#38BDF8] px-2.5 py-0.5 rounded border border-[#0284C7]/30 font-medium">
                    {effectivePlayable.audioTag || item.audioTag || 'Dolby Digital / Multi'}
                  </span>
                  <span className="bg-[#1A1A2E] text-purple-300 px-2.5 py-0.5 rounded border border-purple-500/30 font-mono font-medium">
                    {ext}
                  </span>
                  <span className="text-zinc-400 font-mono text-xs">
                    {sizeFormatted}
                  </span>
                </>
              )}
            </div>

            {/* Genre Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {genres.map((g) => (
                <span
                  key={g}
                  className="px-2.5 py-0.5 rounded bg-[#171C28] text-zinc-300 text-xs font-medium border border-white/5"
                >
                  {g}
                </span>
              ))}
            </div>

            {/* Tagline (if real) */}
            {tagline && (
              <p className="text-sm italic font-medium text-amber-300/90 pt-1">
                "{tagline}"
              </p>
            )}

            {/* Plot Summary */}
            <p className="text-sm text-zinc-300 leading-relaxed max-w-3xl pt-0.5">
              {plot}
            </p>

            {/* Director & Cast */}
            {(director || cast) && (
              <div className="text-xs text-zinc-400 space-y-1 pt-1">
                {director && (
                  <p>
                    <span className="text-zinc-500 font-medium">Director:</span>{' '}
                    <span className="text-zinc-200">{director}</span>
                  </p>
                )}
                {cast && (
                  <p>
                    <span className="text-zinc-500 font-medium">Starring:</span>{' '}
                    <span className="text-zinc-200">{cast}</span>
                  </p>
                )}
              </div>
            )}

            {/* Main Action Buttons Row */}
            <div className="flex flex-wrap items-center gap-3 pt-3">
              {/* Primary Play Button */}
              {loadError && !isLoading ? (
                <button
                  onClick={() => setRetryTick((n) => n + 1)}
                  className="bg-red-500/90 text-white font-semibold text-xs sm:text-sm px-6 py-2.5 rounded-lg flex items-center gap-2 shadow-lg"
                >
                  <span>Server not responding — Tap to retry</span>
                </button>
              ) : isLoading ? (
                <button
                  disabled
                  className="bg-[#E5A00D]/70 text-black font-semibold text-xs sm:text-sm px-6 py-2.5 rounded-lg flex items-center gap-2 shadow-lg cursor-not-allowed opacity-80"
                >
                  <Loader2 className="w-4 h-4 fill-black animate-spin" />
                  <span>Scanning stream...</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (isSeries) {
                      onPlayItem(effectivePlayable, episodes.length > 0 ? episodes : [effectivePlayable], subtitles, seasons);
                    } else {
                      const playableItem = resolvedMovie || (movieFiles.length > 0 ? movieFiles[0] : item);
                      onPlayItem(playableItem, movieFiles.length > 0 ? movieFiles : [playableItem], subtitles);
                    }
                  }}
                  className="bg-[#E5A00D] hover:bg-[#F59E0B] text-black font-semibold text-xs sm:text-sm px-6 py-2.5 rounded-lg flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.02] cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-black" />
                  <span>{isSeries ? (episodes.length > 0 ? 'Play S01E01' : 'Play Series') : 'Play Movie'}</span>
                </button>
              )}

              {/* Watchlist Button */}
              <button
                onClick={() => onToggleWatchlist(item)}
                className="p-2.5 rounded-lg bg-[#181D2A] hover:bg-[#222838] border border-white/10 text-zinc-300 transition-colors cursor-pointer"
                title={isSaved ? 'Remove from Watchlist' : 'Add to Watchlist'}
              >
                {isSaved ? (
                  <BookmarkCheck className="w-4 h-4 text-amber-400" />
                ) : (
                  <Bookmark className="w-4 h-4" />
                )}
              </button>

              {/* Copy Stream Link */}
              <button
                onClick={handleCopyLink}
                className="p-2.5 rounded-lg bg-[#181D2A] hover:bg-[#222838] border border-white/10 text-zinc-300 transition-colors cursor-pointer relative"
                title="Copy direct stream link for external players"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content View (Differentiated for Movie vs Series) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* MOVIE VIEW: Technical Details, Available Files, Subtitles, & Tips */}
        {!isSeries ? (
          <div className="space-y-6">
            {/* Technical Specifications Grid */}
            <div className="bg-[#0E121B] border border-[#181E2B] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#181E2B] pb-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <FileVideo className="w-4 h-4 text-amber-400" />
                  <span>Media Stream & Technical Details</span>
                </div>
                <span className="text-xs font-mono text-zinc-400">{sizeFormatted}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-xs">
                <div className="bg-[#131722] p-3 rounded-lg border border-white/5 space-y-1">
                  <span className="text-zinc-500 text-[11px] block">Container</span>
                  <span className="font-mono font-semibold text-white">.{ext}</span>
                </div>
                <div className="bg-[#131722] p-3 rounded-lg border border-white/5 space-y-1">
                  <span className="text-zinc-500 text-[11px] block">Resolution</span>
                  <span className="font-mono font-semibold text-white">
                    {effectivePlayable.quality || item.quality || '1080p FHD'}
                  </span>
                </div>
                <div className="bg-[#131722] p-3 rounded-lg border border-white/5 space-y-1">
                  <span className="text-zinc-500 text-[11px] block">Audio</span>
                  <span className="font-mono font-semibold text-white">
                    {effectivePlayable.audioTag || item.audioTag || 'DD 5.1 / Multi'}
                  </span>
                </div>
                <div className="bg-[#131722] p-3 rounded-lg border border-white/5 space-y-1">
                  <span className="text-zinc-500 text-[11px] block">File Size</span>
                  <span className="font-mono font-semibold text-white">{sizeFormatted}</span>
                </div>
                <div className="bg-[#131722] p-3 rounded-lg border border-white/5 space-y-1">
                  <span className="text-zinc-500 text-[11px] block">Video Codec</span>
                  <span className="font-mono font-semibold text-white">
                    {effectivePlayable.codecTag || 'x264 / H.264'}
                  </span>
                </div>
                <div className="bg-[#131722] p-3 rounded-lg border border-white/5 space-y-1">
                  <span className="text-zinc-500 text-[11px] block">Server</span>
                  <span className="font-mono font-semibold text-emerald-400 truncate block">
                    {item.sourceServerName || 'BDIX Server'}
                  </span>
                </div>
              </div>

              <div className="text-xs font-mono text-zinc-400 bg-[#121622] p-2.5 rounded-lg border border-white/5 flex items-center justify-between gap-3">
                <span className="truncate text-zinc-300">File: {filename}</span>
                <button
                  onClick={handleCopyLink}
                  className="shrink-0 text-amber-400 hover:text-amber-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  {copiedLink ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>

            {/* If folder contains multiple video files / versions (e.g. 1080p, 720p, sample) */}
            {movieFiles.length > 1 && (
              <div className="bg-[#0E121B] border border-[#181E2B] rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <FileVideo className="w-4 h-4 text-amber-400" />
                  <span>Available Files in Folder ({movieFiles.length})</span>
                </h3>

                <div className="space-y-2">
                  {movieFiles.map((file, idx) => (
                    <div
                      key={file.id || idx}
                      onClick={() => onPlayItem(file, movieFiles, subtitles)}
                      className="p-3 rounded-lg bg-[#131722] hover:bg-[#1A202E] border border-white/5 hover:border-amber-500/30 flex items-center justify-between gap-4 cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center shrink-0 group-hover:bg-[#E5A00D] transition-colors">
                          <Play className="w-3.5 h-3.5 fill-white group-hover:fill-black text-white group-hover:text-black" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-zinc-200 group-hover:text-amber-400 truncate">
                            {file.rawName}
                          </p>
                          <p className="text-[11px] font-mono text-zinc-500">
                            {file.quality || '1080p'} · {file.sizeFormatted || 'Standard'}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-amber-400 group-hover:underline shrink-0">
                        Play File
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Subtitles Available in Folder */}
            {subtitles.length > 0 && (
              <div className="bg-[#0E121B] border border-[#181E2B] rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Info className="w-4 h-4 text-emerald-400" />
                  <span>Subtitles Available ({subtitles.length})</span>
                </h3>
                <div className="flex flex-wrap gap-2">
                  {subtitles.map((sub, idx) => (
                    <a
                      key={sub.id || idx}
                      href={sub.url}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-[#141824] hover:bg-[#1E2436] border border-white/10 text-xs font-mono text-zinc-300 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Download className="w-3 h-3 text-emerald-400" />
                      <span>{sub.rawName}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

          </div>
        ) : (
          /* SERIES VIEW: Season Tabs & Episodes List */
          <div className="space-y-6">
            {/* Season Selector & Total Info */}
            <div className="flex items-center justify-between border-b border-[#161B24] pb-4">
              <div className="flex flex-wrap items-center gap-2">
                {seasons.length > 0 ? (
                  seasons.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSelectSeason(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        s.id === selectedSeasonId
                          ? 'bg-[#1C2230] text-zinc-100 border border-amber-500/30'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#121622]'
                      }`}
                    >
                      {s.label} {s.episodes && `(${s.episodes.length})`}
                    </button>
                  ))
                ) : (
                  <span className="px-3 py-1.5 rounded-lg bg-[#1C2230] text-zinc-100 text-xs font-semibold">
                    Season 1
                  </span>
                )}
              </div>

              <div className="text-xs font-mono text-zinc-400">
                {episodes.length > 0 ? `${episodes.length} episodes` : 'Scanning episodes...'}
              </div>
            </div>

            {/* Loading Indicator */}
            {isLoading && (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                <span className="text-xs font-mono">Loading episode files from FTP...</span>
              </div>
            )}

            {loadError && !isLoading && episodes.length === 0 && (
              <div className="py-10 text-center text-xs font-mono text-red-300">
                The server did not answer in time. Check your internet / network (some servers only work on their own ISP), then tap retry.
              </div>
            )}

            {/* Real Episode List */}
            {!isLoading && (
              <div className="space-y-3">
                {episodes.length > 0 ? (
                  episodes.map((ep, idx) => {
                    const epNum = ep.episode || idx + 1;
                    const sNum = ep.season || 1;
                    const epTag = `S${String(sNum).padStart(2, '0')}E${String(epNum).padStart(2, '0')}`;
                    const isUpNext = idx === 0;
                    const isWatched = watchedEpisodeIds.has(ep.id);
                    const isActive = activeEpisodeId === ep.id;

                    return (
                      <div
                        key={ep.id}
                        onClick={() => onPlayItem(ep, episodes, subtitles, seasons)}
                        className={`group p-3 rounded-xl flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between cursor-pointer transition-all border ${
                          isActive || isUpNext
                            ? 'bg-[#151410] border-amber-500/30'
                            : 'bg-[#0E121B] border-[#181E2B] hover:border-zinc-700 hover:bg-[#121622]'
                        }`}
                      >
                        {/* Left: Thumbnail with Play Hover */}
                        <div className="relative w-full sm:w-48 aspect-video rounded-lg overflow-hidden bg-[#1A202E] shrink-0">
                          {true ? (
                            <EpisodeThumb
                              videoUrl={ep.url}
                              still={guide?.[`S${sNum}E${epNum}`]?.image}
                              fallback={backdropUrl || posterUrl}
                              className="w-full h-full object-cover opacity-90"
                            />
                          ) : (
                            <img
                              src={backdropUrl || posterUrl}
                              alt=""
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 opacity-80"
                            />
                          )}
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-8 h-8 rounded-full bg-[#E5A00D] text-black flex items-center justify-center shadow-lg">
                              <Play className="w-3.5 h-3.5 fill-black translate-x-0.5" />
                            </div>
                          </div>
                        </div>

                        {/* Center: Episode Title, Tags, File Info */}
                        <div className="flex-1 space-y-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-zinc-400 font-bold">
                              {epTag}
                            </span>
                            {isUpNext && (
                              <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                                Up next
                              </span>
                            )}
                          </div>

                          <h4 className="font-semibold text-sm text-zinc-100 group-hover:text-amber-400 transition-colors truncate">
                            {true
                              ? episodeName(guide, sNum, epNum) || `Episode ${epNum}`
                              : ep.cleanTitle || ep.rawName}
                          </h4>

                          <div className="text-[11px] font-mono text-zinc-500 flex items-center gap-2">
                            <span>{ep.quality || '1080p'}</span>
                            <span>·</span>
                            <span>{ep.sizeFormatted || 'Standard'}</span>
                          </div>
                        </div>

                        {/* Right: Checkmark indicator */}
                        <div className="shrink-0 p-2 text-zinc-500">
                          {isWatched ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Check className="w-4 h-4 opacity-30 group-hover:opacity-70 transition-opacity" />
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-8 text-center text-zinc-400 bg-[#0E121B] rounded-xl border border-white/5 space-y-2">
                    <p className="font-medium text-sm">No episode files found in this series folder.</p>
                    <p className="text-xs text-zinc-500">Use the back button or choose another source from the sidebar.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
