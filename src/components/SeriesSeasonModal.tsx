import React, { useEffect, useState } from 'react';
import {
  X,
  Play,
  Tv,
  FolderOpen,
  Loader2,
  Star,
  Film,
  Layers,
  Subtitles,
} from 'lucide-react';
import { ParsedFtpItem } from '../utils/ftpParser';
import {
  SeasonFolderInfo,
  crawlSeriesSeasons,
  loadSeasonEpisodes,
  EnrichedMetadata,
} from '../services/ftpClient';

interface SeriesSeasonModalProps {
  seriesItem: ParsedFtpItem | null;
  enrichedMeta?: EnrichedMetadata | null;
  onClose: () => void;
  onPlayEpisode: (
    episode: ParsedFtpItem,
    seasonEpisodes: ParsedFtpItem[],
    subtitles: ParsedFtpItem[],
    allSeasons: SeasonFolderInfo[]
  ) => void;
  onOpenRawFolder: (url: string) => void;
}

export const SeriesSeasonModal: React.FC<SeriesSeasonModalProps> = ({
  seriesItem,
  enrichedMeta,
  onClose,
  onPlayEpisode,
  onOpenRawFolder,
}) => {
  const [isLoadingSeries, setIsLoadingSeries] = useState(false);
  const [isLoadingSeason, setIsLoadingSeason] = useState(false);
  const [seasons, setSeasons] = useState<SeasonFolderInfo[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [episodes, setEpisodes] = useState<ParsedFtpItem[]>([]);
  const [subtitles, setSubtitles] = useState<ParsedFtpItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!seriesItem) return;
    let cancelled = false;
    setIsLoadingSeries(true);
    setErrorMsg(null);
    setSeasons([]);
    setEpisodes([]);
    setSubtitles([]);

    crawlSeriesSeasons(seriesItem)
      .then((res) => {
        if (cancelled) return;
        setSeasons(res.seasons);
        if (res.seasons.length > 0) {
          setSelectedSeasonId(res.seasons[0].id);
          setEpisodes(res.initialEpisodes);
          setSubtitles(res.initialSubtitles);
        } else {
          setErrorMsg('No season or episode files found directly inside this folder.');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(err?.message || 'Could not load series seasons.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSeries(false);
      });

    return () => {
      cancelled = true;
    };
  }, [seriesItem]);

  if (!seriesItem) return null;

  const activeSeason = seasons.find((s) => s.id === selectedSeasonId) || seasons[0];

  const handleSelectSeason = async (season: SeasonFolderInfo) => {
    setSelectedSeasonId(season.id);
    if (season.episodes && season.episodes.length > 0) {
      setEpisodes(season.episodes);
      setSubtitles(season.subtitles || []);
      return;
    }

    setIsLoadingSeason(true);
    try {
      const loaded = await loadSeasonEpisodes(season, seriesItem);
      season.episodes = loaded.episodes;
      season.subtitles = loaded.subtitles;
      setEpisodes(loaded.episodes);
      setSubtitles(loaded.subtitles);
    } catch {
      setEpisodes([]);
    } finally {
      setIsLoadingSeason(false);
    }
  };

  const posterUrl = enrichedMeta?.posterUrl || seriesItem.posterUrl;
  const backdropUrl = enrichedMeta?.backdropUrl || posterUrl;
  const displayYear = enrichedMeta?.year || seriesItem.year;
  const rating = enrichedMeta?.imdbRating || seriesItem.imdbRating;
  const plot = enrichedMeta?.plot || seriesItem.plot;
  const cast = enrichedMeta?.cast || seriesItem.cast;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl bg-[#11131C] border border-white/15 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Series Hero Header */}
        <div className="relative p-5 sm:p-7 border-b border-white/10 bg-[#090A0F] overflow-hidden shrink-0">
          {backdropUrl && (
            <img
              src={backdropUrl}
              alt={seriesItem.cleanTitle}
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover opacity-25 blur-[2px] scale-105"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#11131C] via-[#11131C]/80 to-black/50" />

          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              {posterUrl ? (
                <img
                  src={posterUrl}
                  alt={seriesItem.cleanTitle}
                  referrerPolicy="no-referrer"
                  className="hidden sm:block w-24 h-36 object-cover rounded-xl border border-white/15 shrink-0 shadow-lg"
                />
              ) : (
                <div className="hidden sm:flex w-24 h-36 rounded-xl bg-white/5 border border-white/10 items-center justify-center shrink-0">
                  <Tv className="w-8 h-8 text-[#E50914]" />
                </div>
              )}

              <div className="space-y-2 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                  <span className="px-2 py-0.5 rounded bg-[#E50914] text-white font-semibold uppercase tracking-wider">
                    TV Series
                  </span>
                  {displayYear && <span className="text-zinc-300">{displayYear}</span>}
                  {rating && (
                    <span className="text-amber-400 flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-400" />
                      {rating}
                    </span>
                  )}
                  {seasons.length > 0 && (
                    <span className="text-emerald-400 font-semibold">
                      {seasons.length} {seasons.length === 1 ? 'Season' : 'Seasons'} Available
                    </span>
                  )}
                </div>

                <h2 className="text-xl sm:text-2xl font-display font-bold text-white leading-tight">
                  {seriesItem.cleanTitle}
                </h2>

                {plot ? (
                  <p className="text-xs sm:text-sm text-zinc-300 line-clamp-2 leading-relaxed">
                    {plot}
                  </p>
                ) : (
                  <p className="text-xs font-mono text-zinc-400 truncate">
                    {seriesItem.rawName}
                  </p>
                )}

                {cast && (
                  <p className="text-xs text-zinc-400 truncate">
                    <span className="text-zinc-500">Cast:</span> {cast}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  {episodes.length > 0 && (
                    <button
                      onClick={() =>
                        onPlayEpisode(
                          {
                            ...episodes[0],
                            posterUrl: posterUrl || episodes[0].posterUrl,
                            backdropUrl: backdropUrl || episodes[0].backdropUrl,
                          },
                          episodes,
                          subtitles,
                          seasons
                        )
                      }
                      className="px-4 py-2 rounded-xl bg-[#E50914] hover:bg-[#f6121d] text-white text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>
                        Play {activeSeason ? activeSeason.label : 'Series'} · Ep 1
                      </span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      onClose();
                      onOpenRawFolder(seriesItem.url);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Browse FTP Folder</span>
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Season Selector Bar & Episodes List */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {isLoadingSeries ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-zinc-400">
              <Loader2 className="w-7 h-7 text-[#E50914] animate-spin" />
              <p className="text-xs sm:text-sm font-mono">
                Scanning Seasons & Episodes for {seriesItem.cleanTitle}...
              </p>
            </div>
          ) : errorMsg && seasons.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm text-zinc-300">{errorMsg}</p>
              <button
                onClick={() => {
                  onClose();
                  onOpenRawFolder(seriesItem.url);
                }}
                className="px-4 py-2 rounded-xl bg-[#E50914] text-white text-xs font-semibold cursor-pointer"
              >
                Open Raw Folder in Explorer
              </button>
            </div>
          ) : (
            <>
              {/* SEASON SELECTOR TABS & DROPDOWN */}
              <div className="space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 uppercase tracking-wider">
                    <Layers className="w-4 h-4 text-[#E50914]" />
                    <span>Select Season (সিজন সিলেক্ট করুন):</span>
                  </div>

                  {seasons.length > 1 && (
                    <select
                      value={selectedSeasonId}
                      onChange={(e) => {
                        const found = seasons.find((s) => s.id === e.target.value);
                        if (found) handleSelectSeason(found);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#090A0F] border border-white/15 text-xs text-white font-medium focus:outline-none focus:border-[#E50914] cursor-pointer"
                    >
                      {seasons.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                          {s.qualityLabel ? ` — ${s.qualityLabel}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1.5">
                  {seasons.map((season) => {
                    const isSelected = season.id === selectedSeasonId;
                    return (
                      <button
                        key={season.id}
                        onClick={() => handleSelectSeason(season)}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 border ${
                          isSelected
                            ? 'bg-[#E50914] border-[#E50914] text-white shadow-lg shadow-[#E50914]/20'
                            : 'bg-[#090A0F] hover:bg-white/5 border-white/10 text-zinc-300'
                        }`}
                      >
                        <span>{season.label}</span>
                        {season.qualityLabel && (
                          <span className="ml-1.5 text-[11px] font-mono opacity-80">
                            ({season.qualityLabel})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* EPISODES IN SELECTED SEASON */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-display font-semibold text-white flex items-center gap-2">
                    <Film className="w-4 h-4 text-[#E50914]" />
                    <span>
                      {activeSeason ? `${activeSeason.label} Episodes` : 'Episodes'} (
                      {episodes.length})
                    </span>
                  </h3>
                  {subtitles.length > 0 && (
                    <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                      <Subtitles className="w-3.5 h-3.5" />
                      {subtitles.length} Subtitles Attached
                    </span>
                  )}
                </div>

                {isLoadingSeason ? (
                  <div className="py-10 flex items-center justify-center gap-2.5 text-xs font-mono text-zinc-400">
                    <Loader2 className="w-5 h-5 text-[#E50914] animate-spin" />
                    <span>Loading episodes for {activeSeason?.label}...</span>
                  </div>
                ) : episodes.length === 0 ? (
                  <div className="p-6 rounded-xl bg-[#090A0F] border border-white/10 text-center space-y-2">
                    <p className="text-xs text-zinc-400">
                      No direct episode video files found in this season folder.
                    </p>
                    {activeSeason && (
                      <button
                        onClick={() => {
                          onClose();
                          onOpenRawFolder(activeSeason.url);
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white cursor-pointer"
                      >
                        Open Season Folder in Explorer
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {episodes.map((ep, idx) => {
                      const epNum = ep.episode ?? idx + 1;
                      return (
                        <div
                          key={ep.id}
                          onClick={() =>
                            onPlayEpisode(
                              {
                                ...ep,
                                posterUrl: posterUrl || ep.posterUrl,
                                backdropUrl: backdropUrl || ep.backdropUrl,
                              },
                              episodes,
                              subtitles,
                              seasons
                            )
                          }
                          className="group p-3.5 rounded-xl bg-[#090A0F] hover:bg-white/[0.04] border border-white/[0.08] hover:border-[#E50914]/50 transition-all flex items-center justify-between gap-3 cursor-pointer"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="w-10 h-10 rounded-lg bg-[#E50914]/15 group-hover:bg-[#E50914] text-[#E50914] group-hover:text-white font-mono text-xs font-bold flex items-center justify-center transition-colors shrink-0">
                              E{String(epNum).padStart(2, '0')}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs sm:text-sm font-semibold text-white group-hover:text-[#E50914] transition-colors truncate">
                                Episode {epNum} — {ep.cleanTitle}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono text-zinc-400 truncate mt-0.5">
                                {ep.quality && (
                                  <span className="text-zinc-300">{ep.quality}</span>
                                )}
                                {ep.audioTag && (
                                  <span className="text-emerald-400">{ep.audioTag}</span>
                                )}
                                {ep.codecTag && <span>{ep.codecTag}</span>}
                                {ep.sizeFormatted && <span>{ep.sizeFormatted}</span>}
                                <span className="text-zinc-500 truncate max-w-xs">
                                  {ep.rawName}
                                </span>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            className="px-3.5 py-2 rounded-lg bg-[#E50914] hover:bg-[#f6121d] text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 fill-white" />
                            <span>Play</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
