import {
  DirectoryBrowseResult,
  ParsedFtpItem,
  parseDirectoryHtml,
  isPrivateOrBdixUrl,
  extractSeasonNumber,
  isSeasonFolderName,
} from '../utils/ftpParser';
import { INITIAL_UNIFIED_CATALOG } from '../utils/seedData';

const LOCAL_BRIDGE_BASE = 'http://127.0.0.1:7788';
const META_STORAGE_KEY = 'cineftp_meta_cache_v1';

export interface EnrichedMetadata {
  found: boolean;
  posterUrl?: string;
  backdropUrl?: string;
  imdbId?: string;
  imdbRating?: string;
  year?: number;
  cast?: string;
  director?: string;
  tagline?: string;
  genres?: string[];
  plot?: string;
  runtime?: string;
}

export interface ProbedAudioTrack {
  audioIndex: number;
  streamIndex: number;
  codec: string;
  language: string;
  label: string;
  channels: number;
  isBrowserNative: boolean;
  companionUrl?: string;
}

export interface ProbedSubtitleTrack {
  subIndex: number;
  streamIndex: number;
  codec: string;
  language: string;
  label: string;
}

export interface MediaProbeInfo {
  duration: number;
  video: {
    codec: string;
    profile?: string;
    pixFmt?: string;
    width: number;
    height: number;
    needsVideoTranscode?: boolean;
  } | null;
  audioTracks: ProbedAudioTrack[];
  subtitleTracks: ProbedSubtitleTrack[];
  ffmpegAvailable?: boolean;
}

export interface SeasonFolderInfo {
  id: string;
  seasonNumber: number;
  label: string;
  qualityLabel?: string;
  url: string;
  episodes?: ParsedFtpItem[];
  subtitles?: ParsedFtpItem[];
}

export interface SeriesInspectionResult {
  seriesItem: ParsedFtpItem;
  seasons: SeasonFolderInfo[];
  initialEpisodes: ParsedFtpItem[];
  initialSubtitles: ParsedFtpItem[];
}

const localMetaCache: Map<string, EnrichedMetadata> = new Map();
try {
  const raw = localStorage.getItem(META_STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    for (const [k, v] of Object.entries(parsed)) {
      localMetaCache.set(k, v as EnrichedMetadata);
    }
  }
} catch {}

const META_CACHE_MAX = 4000;
let metaSaveTimer: number | null = null;

function writeMetaCacheNow() {
  metaSaveTimer = null;
  try {
    if (localMetaCache.size > META_CACHE_MAX) {
      // Map keeps insertion order: drop the oldest ~20%
      const drop = Array.from(localMetaCache.keys()).slice(0, Math.ceil(META_CACHE_MAX * 0.2));
      drop.forEach((k) => localMetaCache.delete(k));
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const obj: Record<string, EnrichedMetadata> = {};
      localMetaCache.forEach((v, k) => {
        // Keep the stored copy small: grid cards need the poster/year/rating, detail pages a short plot
        obj[k] = v && v.plot && v.plot.length > 420 ? { ...v, plot: v.plot.slice(0, 420) + '…' } : v;
      });
      try {
        localStorage.setItem(META_STORAGE_KEY, JSON.stringify(obj));
        return;
      } catch {
        // storage full: forget the oldest 30% and try again
        const drop = Array.from(localMetaCache.keys()).slice(0, Math.ceil(localMetaCache.size * 0.3));
        drop.forEach((k) => localMetaCache.delete(k));
      }
    }
  } catch {}
}

// Writing thousands of entries after EVERY lookup froze the UI: save at most once every 2 seconds
function saveMetaCache() {
  if (metaSaveTimer !== null) return;
  metaSaveTimer = window.setTimeout(writeMetaCacheNow, 2000);
}
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (metaSaveTimer !== null) {
      window.clearTimeout(metaSaveTimer);
      writeMetaCacheNow();
    }
  });
}

let isLocalBridgeAvailable = false;

export async function checkLocalBridge(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_BRIDGE_BASE}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      isLocalBridgeAvailable = true;
      return true;
    }
  } catch {}
  isLocalBridgeAvailable = false;
  return false;
}

export function getLocalBridgeStatus(): boolean {
  return isLocalBridgeAvailable;
}

export function normalizeFtpUrl(input: string): string {
  let clean = input.trim();
  if (!clean) return '';
  if (!/^(https?|ftp):\/\//i.test(clean)) {
    clean = `http://${clean}`;
  }
  try {
    const u = new URL(clean);
    if (u.pathname === '') u.pathname = '/';
    return u.href;
  } catch {
    return clean;
  }
}

/**
 * Robust check if a parsed FTP item is a playable media video file
 */
export function isMediaVideoItem(i: ParsedFtpItem): boolean {
  if (i.isDirectory) return false;
  if (i.mediaKind === 'movie' || i.mediaKind === 'episode') return true;
  if (i.extension && /^(mp4|mkv|webm|avi|mov|ts|m4v|flv|wmv|m2ts)$/i.test(i.extension)) return true;
  return /\.(mp4|mkv|webm|avi|mov|ts|m4v|flv|wmv|m2ts)(\?.*)?$/i.test(i.url);
}

/**
 * Universal Sort: Newest media releases (2026, 2025, 2024...) ALWAYS appear first,
 * followed by newest lastModified dates, and lastly older cinema classics.
 */
export function sortNewestFirst<T extends ParsedFtpItem>(items: T[]): T[] {
  const currentYear = new Date().getFullYear();
  return [...items].sort((a, b) => {
    // 1. Release Year (2026, 2025, 2024...)
    const yearA = a.year && a.year > 1900 && a.year <= currentYear + 2 ? a.year : 0;
    const yearB = b.year && b.year > 1900 && b.year <= currentYear + 2 ? b.year : 0;
    if (yearA !== yearB) {
      return yearB - yearA;
    }

    // 2. Last Modified date if available
    const timeA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
    const timeB = b.lastModified ? new Date(b.lastModified).getTime() : 0;
    if (timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) {
      return timeB - timeA;
    }

    // 3. Fallback stable alphabetical
    return a.cleanTitle.localeCompare(b.cleanTitle);
  });
}

const sessionDirCache = new Map<string, DirectoryBrowseResult>();

/**
 * Browse any FTP / HTTP Open Directory URL cleanly via /api/browse
 */
export async function browseFtpDirectory(
  rawUrl: string,
  forceRefresh = false
): Promise<DirectoryBrowseResult> {
  const targetUrl = normalizeFtpUrl(rawUrl);
  if (!targetUrl) {
    throw new Error('Please enter a valid FTP or HTTP server URL.');
  }

  if (!forceRefresh && sessionDirCache.has(targetUrl)) {
    return sessionDirCache.get(targetUrl)!;
  }

  // If user explicitly connected Local Bridge, try it first
  if (isLocalBridgeAvailable && isPrivateOrBdixUrl(targetUrl)) {
    try {
      const bridgeRes = await fetch(
        `${LOCAL_BRIDGE_BASE}/raw?url=${encodeURIComponent(targetUrl)}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (bridgeRes.ok) {
        const data = await bridgeRes.json();
        if (data.html) {
          const parsed = parseDirectoryHtml(
            data.html,
            data.finalUrl || targetUrl,
            'local-bridge'
          );
          sessionDirCache.set(targetUrl, parsed);
          return parsed;
        }
      }
    } catch {}
  }

  // Primary Cloud Backend + BDIX Public Gateway Resolver (/api/browse always returns 200 OK)
  const apiRes = await fetch(`/api/browse?url=${encodeURIComponent(targetUrl)}`);
  const data = await apiRes.json();

  if (data.error || !Array.isArray(data.items)) {
    const err: any = new Error(data.error || 'Failed to load directory');
    err.isPrivateNetwork = Boolean(data.isPrivateNetwork || isPrivateOrBdixUrl(targetUrl));
    err.hint = data.hint;
    err.targetUrl = targetUrl;
    throw err;
  }

  const result = data as DirectoryBrowseResult;
  sessionDirCache.set(targetUrl, result);
  return result;
}

/**
 * Crawl & Combine Multiple FTP Links Together into One Unified Catalog
 * Automatically unpacks ALL year subfolders (2026, 2025, 2024... down to 1990)
 * so all movies across all years appear together without clicking into folders!
 */
export async function browseMultipleFtpDirectories(
  sources: { id: string; name: string; url: string }[],
  onStreamUpdate?: (
    items: ParsedFtpItem[],
    summaries: { name: string; url: string; count: number; ok: boolean }[]
  ) => void
): Promise<{
  combinedItems: ParsedFtpItem[];
  combinedSubtitles: ParsedFtpItem[];
  sourceSummaries: { name: string; url: string; count: number; ok: boolean }[];
}> {
  const combinedItems: ParsedFtpItem[] = [];
  const combinedSubtitles: ParsedFtpItem[] = [];
  const seenIds = new Set<string>();
  const sourceSummaries: { name: string; url: string; count: number; ok: boolean }[] = [];

  await Promise.all(
    sources.map(async (source) => {
      try {
        const dirRes = await browseFtpDirectory(source.url);
        let addedCount = 0;
        const isSeriesSource = /series|tv|anime|cartoon|drama/i.test(source.url);

        const tagAndAdd = (item: ParsedFtpItem, fallbackYear?: number) => {
          // Never add year_folder items themselves when unpacking all years together
          if (item.mediaKind === 'year_folder') return;
          if (seenIds.has(item.id)) return;
          seenIds.add(item.id);
          let resolvedKind = item.mediaKind;
          if (item.isDirectory && resolvedKind === 'generic_folder') {
            resolvedKind = isSeriesSource ? 'series' : 'movie';
          }
          const normTitle = item.cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
          const seedMatch = INITIAL_UNIFIED_CATALOG.find(
            (s) =>
              !s.isDirectory &&
              /\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(s.url) &&
              normTitle.length >= 3 &&
              s.cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '') === normTitle
          );
          if (seedMatch) {
            saveCachedPlayableUrl(item.id, seedMatch.url);
            saveCachedPlayableUrl(item.url, seedMatch.url);
          }
          const tagged: ParsedFtpItem = {
            ...item,
            mediaKind: resolvedKind,
            year: item.year || fallbackYear || seedMatch?.year,
            posterUrl: item.posterUrl || seedMatch?.posterUrl,
            backdropUrl: item.backdropUrl || seedMatch?.backdropUrl,
            runtime: item.runtime || seedMatch?.runtime,
            imdbRating: item.imdbRating || seedMatch?.imdbRating,
            plot: item.plot || seedMatch?.plot,
            sourceServerName: source.name,
            sourceServerUrl: source.url,
          };
          combinedItems.push(tagged);
          addedCount++;
        };

        for (const sub of dirRes.subtitles) {
          if (!seenIds.has(sub.id)) {
            seenIds.add(sub.id);
            combinedSubtitles.push({
              ...sub,
              sourceServerName: source.name,
              sourceServerUrl: source.url,
            });
          }
        }

        const yearFolders = dirRes.items
          .filter((i) => i.isDirectory && i.mediaKind === 'year_folder')
          .sort((a, b) => (b.year || 0) - (a.year || 0));

        const directMedia = dirRes.items.filter(
          (i) => i.mediaKind === 'movie' || i.mediaKind === 'series' || i.mediaKind === 'episode'
        );

        for (const item of dirRes.items) {
          tagAndAdd(item);
        }

        const summaryEntry = {
          name: source.name,
          url: source.url,
          count: addedCount,
          ok: true,
        };
        sourceSummaries.push(summaryEntry);

        // Unpack ALL year subfolders (or top subfolders if no year folders) in parallel batches
        const targetFolders =
          yearFolders.length > 0
            ? yearFolders
            : directMedia.length < 8
            ? dirRes.items.filter((i) => i.isDirectory).slice(0, 6)
            : [];

        const BATCH_SIZE = 7;
        for (let i = 0; i < targetFolders.length; i += BATCH_SIZE) {
          const batch = targetFolders.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(async (subFolder) => {
              try {
                const subRes = await browseFtpDirectory(subFolder.url);
                const subIsSeries =
                  isSeriesSource || /series|tv|anime|cartoon|drama/i.test(subFolder.url);
                for (const subItem of subRes.items) {
                  if (subItem.isDirectory && subItem.mediaKind === 'generic_folder') {
                    subItem.mediaKind = subIsSeries ? 'series' : 'movie';
                  }
                  tagAndAdd(subItem, subFolder.year);
                }
              } catch {}
            })
          );
          summaryEntry.count = addedCount;
          if (onStreamUpdate) {
            onStreamUpdate([...combinedItems], [...sourceSummaries]);
          }
        }
      } catch {
        sourceSummaries.push({
          name: source.name,
          url: source.url,
          count: 0,
          ok: false,
        });
      }
    })
  );

  return {
    combinedItems,
    combinedSubtitles,
    sourceSummaries,
  };
}

const INDEX_STORAGE_KEY = 'cineftp_indexed_cache_v3'; // v3: A-Z bucket folders are now unpacked
const INDEX_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedIndexRecord {
  timestamp: number;
  items: ParsedFtpItem[];
  hasSubfolders: boolean;
}

const unpackedDirCache = new Map<string, ParsedFtpItem[]>();
const persistentIndexCache = new Map<string, CachedIndexRecord>();

// Hydrate indexed catalogs from localStorage for instant, zero-delay startup
try {
  const raw = localStorage.getItem(INDEX_STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    const now = Date.now();
    for (const [k, v] of Object.entries(parsed)) {
      const record = v as CachedIndexRecord;
      if (record && now - record.timestamp < INDEX_TTL_MS && Array.isArray(record.items)) {
        persistentIndexCache.set(k, record);
        unpackedDirCache.set(k, record.items);
      }
    }
  }
} catch {}

export function savePersistentIndexCache() {
  try {
    const obj: Record<string, CachedIndexRecord> = {};
    const entries = Array.from(persistentIndexCache.entries()).slice(-25);
    for (const [k, v] of entries) {
      obj[k] = v;
    }
    localStorage.setItem(INDEX_STORAGE_KEY, JSON.stringify(obj));
  } catch {}
}

export function clearIndexedCache() {
  try {
    persistentIndexCache.clear();
    unpackedDirCache.clear();
    sessionDirCache.clear();
    playableLinksCache.clear();
    localStorage.removeItem(INDEX_STORAGE_KEY);
    localStorage.removeItem(PLAYABLE_CACHE_KEY);
  } catch {}
}

const PLAYABLE_CACHE_KEY = 'cineftp_playable_links_cache_v5';
const playableLinksCache = new Map<string, string>();

try {
  // Clear obsolete v2/v3/v4 caches to permanently wipe any corrupted or synthetic 404 URLs
  localStorage.removeItem('cineftp_playable_links_cache_v2');
  localStorage.removeItem('cineftp_playable_links_cache_v3');
  localStorage.removeItem('cineftp_playable_links_cache_v4');
  const raw = localStorage.getItem(PLAYABLE_CACHE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && /\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(v)) {
        playableLinksCache.set(k, v);
      }
    }
  }
} catch {}

export function getCachedPlayableUrl(idOrUrl: string): string | undefined {
  const cached = playableLinksCache.get(idOrUrl);
  if (cached && (cached.endsWith('/') || !/\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(cached))) {
    playableLinksCache.delete(idOrUrl);
    return undefined;
  }
  return cached;
}

export function saveCachedPlayableUrl(idOrUrl: string, streamUrl: string) {
  // STRICT RULE: Only cache URLs with valid media extensions, NEVER folder URLs
  if (!streamUrl || streamUrl.endsWith('/') || !/\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(streamUrl)) {
    return;
  }
  try {
    playableLinksCache.set(idOrUrl, streamUrl);
    const obj: Record<string, string> = {};
    const entries = Array.from(playableLinksCache.entries()).slice(-400);
    for (const [k, v] of entries) {
      obj[k] = v;
    }
    localStorage.setItem(PLAYABLE_CACHE_KEY, JSON.stringify(obj));
  } catch {}
}

// Concurrency control for metadata fetching (poster lookups).
// 14 at once, and the NEWEST request goes first: that is the card that just scrolled into view.
const META_MAX_PARALLEL = 24;
let activeMetaFetches = 0;
const metaFetchQueue: (() => void)[] = [];
const missedMeta = new Map<string, number>();
const inFlightMetaRequests = new Map<string, Promise<EnrichedMetadata | null>>();

function releaseMetaSlot() {
  activeMetaFetches--;
  const next = metaFetchQueue.pop(); // LIFO
  next?.();
}

async function acquireMetaSlot(): Promise<() => void> {
  if (activeMetaFetches < META_MAX_PARALLEL) {
    activeMetaFetches++;
    return releaseMetaSlot;
  }
  return new Promise((resolve) => {
    metaFetchQueue.push(() => {
      activeMetaFetches++;
      resolve(releaseMetaSlot);
    });
  });
}

/**
 * Deep-browse a single directory:
 * Automatically unpacks ALL year folders (2026, 2025, 2024... down to older)
 * or category/language subfolders, streaming items incrementally so users
 * never have to wait and never have to click any manual unpack button!
 */
export async function browseDirectoryWithDeepScan(
  url: string,
  onProgress?: (loadedCount: number, folderName: string) => void,
  onStreamChunk?: (items: ParsedFtpItem[]) => void,
  forceRefresh = false
): Promise<{
  directResult: DirectoryBrowseResult;
  hasSubfolders: boolean;
  unpackedItems: ParsedFtpItem[];
  subfolders: ParsedFtpItem[];
  totalEstimatedCount: number;
}> {
  const normUrl = normalizeFtpUrl(url);

  // Instant response from memory or persistent cache if already indexed
  if (!forceRefresh) {
    if (unpackedDirCache.has(normUrl)) {
      const cachedItems = unpackedDirCache.get(normUrl)!;
      if (onStreamChunk) onStreamChunk(cachedItems);
      return {
        directResult: {
          url: normUrl,
          serverName: 'FTP Server',
          pageTitle: 'Auto-Unpacked Directory',
          isH5ai: false,
          isPortalRoot: false,
          parentUrl: null,
          breadcrumbs: [{ label: 'Root', url: normUrl }],
          items: cachedItems,
          subtitles: [],
          fetchedVia: 'backend',
        },
        hasSubfolders: true,
        unpackedItems: cachedItems,
        subfolders: [],
        totalEstimatedCount: cachedItems.length,
      };
    }

    if (persistentIndexCache.has(normUrl)) {
      const record = persistentIndexCache.get(normUrl)!;
      unpackedDirCache.set(normUrl, record.items);
      if (onStreamChunk) onStreamChunk(record.items);
      return {
        directResult: {
          url: normUrl,
          serverName: 'FTP Server',
          pageTitle: 'Auto-Unpacked Directory',
          isH5ai: false,
          isPortalRoot: false,
          parentUrl: null,
          breadcrumbs: [{ label: 'Root', url: normUrl }],
          items: record.items,
          subtitles: [],
          fetchedVia: 'backend',
        },
        hasSubfolders: record.hasSubfolders,
        unpackedItems: record.items,
        subfolders: [],
        totalEstimatedCount: record.items.length,
      };
    }
  }

  const dirRes = await browseFtpDirectory(normUrl, forceRefresh);
  const subfolders = dirRes.items.filter((i) => i.isDirectory);
  const isSeriesSource = /series|tv|anime|cartoon|drama|ftp-4/i.test(normUrl);

  // If this is a TV series source (e.g. English-Foreign-TV-Series, Hindi TV Series, Anime Series):
  // The folders in this directory are the TV Series themselves!
  // They must NEVER be unpacked into individual "Season 1", "Season 2" duplicates in the main catalog.
  if (isSeriesSource) {
    // A-Z style bucket folders: "A", "0-9", "TV Series ♦ N—S", "Anime TV Series ★ 0—9", "A-L" ...
    const isLetterBucketFolder = (folder: ParsedFtpItem) => {
      const names = [folder.cleanTitle, folder.rawName].map((n) => (n || '').trim());
      return names.some(
        (n) =>
          /^[A-Z]$/i.test(n) ||
          /^(?:0-9|#|numeric|others?)$/i.test(n) ||
          /(?:^|[\s\u2660-\u2667\u2022\u00b7_(\[])[A-Z0]\s*[\u2014\u2013\u2212~-]\s*[A-Z9][)\]]?$/i.test(n)
      );
    };

    const letterBuckets = subfolders.filter(isLetterBucketFolder);

    if (
      letterBuckets.length >= 2 &&
      letterBuckets.length >= subfolders.length * 0.6
    ) {
      // If organized by A-Z buckets, unpack the buckets to pull all TV Series
      const unpackedSeries: ParsedFtpItem[] = [];
      const seenIds = new Set<string>();

      for (let i = 0; i < letterBuckets.length; i += 6) {
        const batch = letterBuckets.slice(i, i + 6);
        await Promise.all(
          batch.map(async (bucket) => {
            try {
              const bRes = await browseFtpDirectory(bucket.url);
              for (const item of bRes.items) {
                if (item.mediaKind === 'subtitle' || seenIds.has(item.id)) continue;
                seenIds.add(item.id);
                let yr = item.year;
                const m = item.rawName.match(/(?:19|20)\d{2}/);
                if (m && !yr) yr = parseInt(m[0], 10);
                unpackedSeries.push({
                  ...item,
                  mediaKind: 'series',
                  year: yr,
                });
              }
            } catch {}
          })
        );
        if (onStreamChunk) onStreamChunk(sortNewestFirst([...unpackedSeries]));
      }

      const sortedSeries = sortNewestFirst(unpackedSeries);
      unpackedDirCache.set(normUrl, sortedSeries);
      if (sortedSeries.length > 0) {
        persistentIndexCache.set(normUrl, { timestamp: Date.now(), items: sortedSeries, hasSubfolders: true });
        savePersistentIndexCache();
      }
      return {
        directResult: dirRes,
        hasSubfolders: true,
        unpackedItems: sortedSeries,
        subfolders,
        totalEstimatedCount: sortedSeries.length,
      };
    }

    // Direct series root: every directory is an independent TV Series!
    const seriesItems: ParsedFtpItem[] = dirRes.items
      .filter((i) => i.mediaKind !== 'subtitle')
      .map((item) => {
        let yr = item.year;
        let title = item.cleanTitle;

        // Ensure series titles like 1923-2022, 1983-2018, 1883, 1899 have clean titles & correct years
        const yearTitleMatch = item.rawName.match(/^(1883|1899|1923|1983|1992|1971)(?:[\s\.\-_]+((?:19|20)\d{2}))?/i);
        if (yearTitleMatch) {
          title = yearTitleMatch[1];
          if (yearTitleMatch[2]) yr = parseInt(yearTitleMatch[2], 10);
        } else if (!yr) {
          const m = item.rawName.match(/(?:19|20)\d{2}/);
          if (m) yr = parseInt(m[0], 10);
        }

        return {
          ...item,
          cleanTitle: title,
          mediaKind: 'series' as const,
          year: yr,
        };
      });

    const sortedSeriesItems = sortNewestFirst(seriesItems);
    if (onStreamChunk) onStreamChunk(sortedSeriesItems);
    unpackedDirCache.set(normUrl, sortedSeriesItems);
    persistentIndexCache.set(normUrl, {
      timestamp: Date.now(),
      items: sortedSeriesItems,
      hasSubfolders: false,
    });
    savePersistentIndexCache();

    return {
      directResult: dirRes,
      hasSubfolders: false,
      unpackedItems: sortedSeriesItems,
      subfolders: [],
      totalEstimatedCount: sortedSeriesItems.length,
    };
  }

  // Check for year subfolders or container subfolders in movie sources
  const yearFolders = subfolders
    .filter((i) => i.mediaKind === 'year_folder' || /^\(?\d{4}\)?$/.test(i.cleanTitle))
    .sort((a, b) => (b.year || 0) - (a.year || 0));

  const hasSubfolders = subfolders.length > 0;
  const isContainer = subfolders.length >= 2 && subfolders.length >= dirRes.items.length * 0.7;

  if (!isContainer && !hasSubfolders) {
    const sortedDirect = sortNewestFirst(dirRes.items);
    if (onStreamChunk) onStreamChunk(sortedDirect);
    return {
      directResult: dirRes,
      hasSubfolders: false,
      unpackedItems: sortedDirect,
      subfolders: [],
      totalEstimatedCount: dirRes.items.length,
    };
  }

  // Folders to crawl: all year folders or all subfolders
  const targetFolders = yearFolders.length > 0 ? yearFolders : subfolders.slice(0, 36);
  const unpackedItems: ParsedFtpItem[] = [];
  const seenIds = new Set<string>();

  // Add any direct media items already in root
  for (const item of dirRes.items) {
    if (!item.isDirectory) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        unpackedItems.push(item);
      }
    }
  }

  // Initial stream update with direct media items
  if (unpackedItems.length > 0 && onStreamChunk) {
    onStreamChunk(sortNewestFirst([...unpackedItems]));
  }

  // Crawl in parallel batches of 6 for high performance
  const BATCH_SIZE = 6;
  for (let i = 0; i < targetFolders.length; i += BATCH_SIZE) {
    const batch = targetFolders.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (folder) => {
        try {
          const subRes = await browseFtpDirectory(folder.url);
          for (const subItem of subRes.items) {
            if (subItem.mediaKind === 'year_folder' || seenIds.has(subItem.id)) continue;
            seenIds.add(subItem.id);
            let kind = subItem.mediaKind;
            if (subItem.isDirectory && (kind === 'generic_folder' || kind === 'category_folder')) {
              kind = isSeriesSource ? 'series' : 'movie';
            }
            unpackedItems.push({
              ...subItem,
              mediaKind: kind,
              year: subItem.year || folder.year,
            });
          }
          if (onProgress) {
            onProgress(unpackedItems.length, folder.cleanTitle);
          }
        } catch {}
      })
    );

    // Stream the new batch of movies directly to the UI (always newest first)!
    if (onStreamChunk) {
      onStreamChunk(sortNewestFirst([...unpackedItems]));
    }
  }

  const sortedUnpacked = sortNewestFirst(unpackedItems);
  // Cache in memory and localStorage for subsequent instant loading
  unpackedDirCache.set(normUrl, sortedUnpacked);
  persistentIndexCache.set(normUrl, {
    timestamp: Date.now(),
    items: sortedUnpacked,
    hasSubfolders: true,
  });
  savePersistentIndexCache();

  return {
    directResult: dirRes,
    hasSubfolders: true,
    unpackedItems: sortedUnpacked,
    subfolders,
    totalEstimatedCount: Math.max(sortedUnpacked.length, dirRes.items.length),
  };
}

/** Instant (synchronous) lookup of already-known poster data, so cards paint with their picture on the first frame. */
export function peekItemMetadata(item: ParsedFtpItem): EnrichedMetadata | null {
  if (item.mediaKind !== 'movie' && item.mediaKind !== 'series' && item.mediaKind !== 'episode') return null;
  const t = item.cleanTitle.trim();
  if (!t) return null;
  return localMetaCache.get(`${t.toLowerCase()}|${item.year || ''}|${item.mediaKind}`) || null;
}

export async function fetchItemMetadata(
  item: ParsedFtpItem
): Promise<EnrichedMetadata | null> {
  if (
    item.mediaKind !== 'movie' &&
    item.mediaKind !== 'series' &&
    item.mediaKind !== 'episode'
  ) {
    return null;
  }

  const cleanTitle = item.cleanTitle.trim();
  if (!cleanTitle || cleanTitle.length < 2) return null;

  const cacheKey = `${cleanTitle.toLowerCase()}|${item.year || ''}|${item.mediaKind}`;
  if (localMetaCache.has(cacheKey)) {
    return localMetaCache.get(cacheKey)!;
  }
  const missedAt = missedMeta.get(cacheKey);
  if (missedAt && Date.now() - missedAt < 5 * 60 * 1000) return null;

  // In-flight deduplication
  if (inFlightMetaRequests.has(cacheKey)) {
    return inFlightMetaRequests.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    const release = await acquireMetaSlot();
    try {
      const params = new URLSearchParams({
        title: cleanTitle,
        kind: item.mediaKind,
      });
      if (item.year) params.set('year', String(item.year));

      const res = await fetch(`/api/metadata?${params.toString()}`);
      if (!res.ok) return null;
      const data: EnrichedMetadata = await res.json();
      if (data && data.found) {
        localMetaCache.set(cacheKey, data);
        saveMetaCache();
        // download the picture right away so the card shows it instantly
        if (data.posterUrl && typeof Image !== 'undefined') {
          const im = new Image();
          im.referrerPolicy = 'no-referrer';
          im.src = data.posterUrl.replace(/_V1_SX600\.jpg$/i, '_V1_SX340.jpg').replace('600x900bb', '340x510bb');
        }
      } else {
        missedMeta.set(cacheKey, Date.now()); // nothing found: do not hammer the servers, retry later
      }
      return data;
    } catch {
      return null;
    } finally {
      release();
      inFlightMetaRequests.delete(cacheKey);
    }
  })();

  inFlightMetaRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

function sortEpisodesList(videos: ParsedFtpItem[]): ParsedFtpItem[] {
  return [...videos].sort((a, b) => {
    const sa = a.season ?? 1;
    const sb = b.season ?? 1;
    if (sa !== sb) return sa - sb;
    if (a.episode !== undefined && b.episode !== undefined && a.episode !== b.episode) {
      return a.episode - b.episode;
    }
    return a.rawName.localeCompare(b.rawName, undefined, { numeric: true });
  });
}

/**
 * Load all Episode video files and subtitles from a specific Season folder URL
 */
export async function loadSeasonEpisodes(
  seasonFolder: SeasonFolderInfo,
  seriesItem?: ParsedFtpItem
): Promise<{ episodes: ParsedFtpItem[]; subtitles: ParsedFtpItem[] }> {
  if (seasonFolder.episodes && seasonFolder.episodes.length > 0) {
    return {
      episodes: seasonFolder.episodes,
      subtitles: seasonFolder.subtitles || [],
    };
  }

  const dirRes = await browseFtpDirectory(seasonFolder.url);
  let videos = dirRes.items.filter(isMediaVideoItem);
  const subtitles = [...dirRes.subtitles];

  // Check if there is a Subs subfolder or nested quality folder inside the Season folder
  const subFolders = dirRes.items.filter((i) => i.isDirectory);
  const nestedCandidates: { videos: ParsedFtpItem[]; subs: ParsedFtpItem[]; rank: number }[] = [];
  const qRank = (t: string) =>
    /2160p|\b4k\b/i.test(t) ? 4 : /1080p/i.test(t) ? 3 : /720p/i.test(t) ? 2 : /480p|360p/i.test(t) ? 1 : 0;
  for (const sf of subFolders.slice(0, 8)) {
    if (/^(subs?|subtitles?)$/i.test(sf.rawName.trim())) {
      try {
        const sRes = await browseFtpDirectory(sf.url);
        subtitles.push(...sRes.subtitles);
      } catch {}
    } else if (videos.length === 0) {
      try {
        const nestedRes = await browseFtpDirectory(sf.url);
        const nestedVids = nestedRes.items.filter(isMediaVideoItem);
        if (nestedVids.length > 0) {
          nestedCandidates.push({ videos: nestedVids, subs: nestedRes.subtitles, rank: qRank(sf.rawName) });
        }
      } catch {}
    }
  }
  if (videos.length === 0 && nestedCandidates.length > 0) {
    // Several quality folders (720p / 1080p ...): list ONE copy of every episode (best quality, then most episodes)
    nestedCandidates.sort((a, b) => b.rank - a.rank || b.videos.length - a.videos.length);
    videos.push(...nestedCandidates[0].videos);
    subtitles.push(...nestedCandidates[0].subs);
  }

  videos = videos.map((v, idx) => ({
    ...v,
    mediaKind: 'episode',
    season: v.season ?? seasonFolder.seasonNumber,
    episode: v.episode ?? idx + 1,
    cleanTitle: seriesItem?.cleanTitle || v.cleanTitle,
    posterUrl: v.posterUrl || dirRes.localPosterUrl || seriesItem?.posterUrl,
    backdropUrl: seriesItem?.backdropUrl || v.backdropUrl,
    year: v.year || seriesItem?.year,
  }));

  return {
    episodes: sortEpisodesList(videos),
    subtitles,
  };
}

/**
 * Inspect a TV Series folder (up to 3 levels deep, handling Quality folders + Season folders)
 * so the user can choose which Season (Season 1, Season 2, Season 3...) and Episode to play!
 */
export async function crawlSeriesSeasons(
  seriesItem: ParsedFtpItem
): Promise<SeriesInspectionResult> {
  // If explicitly a movie, do not crawl or format as TV series
  if (seriesItem.mediaKind === 'movie') {
    return {
      seriesItem,
      seasons: [],
      initialEpisodes: [],
      initialSubtitles: [],
    };
  }

  // Normalize series URL: strip any video filename if seriesItem.url pointed directly to an episode file
  let seriesUrl = seriesItem.url;
  if (/\.(mp4|mkv|webm|avi|mov|ts|m4v|flv|wmv|m2ts)(\?.*)?$/i.test(seriesUrl)) {
    seriesUrl = seriesUrl.substring(0, seriesUrl.lastIndexOf('/') + 1);
  }
  if (!seriesUrl.endsWith('/')) {
    seriesUrl += '/';
  }

  let rootRes: DirectoryBrowseResult;
  try {
    rootRes = await browseFtpDirectory(seriesUrl);
  } catch {
    return {
      seriesItem,
      seasons: [],
      initialEpisodes: [],
      initialSubtitles: [],
    };
  }

  const directVideos = rootRes.items.filter(isMediaVideoItem);
  const childDirs = rootRes.items.filter(
    (i) =>
      i.isDirectory &&
      !/^(subs?|subtitles?|sample|extras?|featurettes?)$/i.test(i.rawName.trim())
  );

  const seasons: SeasonFolderInfo[] = [];

  // 1. Check if childDirs are directly Season folders (e.g. "Season-1", "Season 2", "S01")
  for (const dir of childDirs) {
    const sNum = extractSeasonNumber(dir.rawName);
    if (sNum !== undefined || isSeasonFolderName(dir.rawName)) {
      const num = sNum ?? seasons.length + 1;
      seasons.push({
        id: dir.url,
        seasonNumber: num,
        label: `Season ${num}`,
        qualityLabel: dir.quality || dir.audioTag,
        url: dir.url,
      });
    }
  }

  // 2. If childDirs are present but none were named "Season X",
  // crawl inside them to find Season folders or direct episode files!
  if (seasons.length === 0 && childDirs.length > 0) {
    await Promise.all(
      childDirs.slice(0, 8).map(async (qDir) => {
        try {
          const qRes = await browseFtpDirectory(qDir.url);
          const qSubDirs = qRes.items.filter(
            (i) =>
              i.isDirectory &&
              !/^(subs?|subtitles?|sample|extras?)$/i.test(i.rawName.trim())
          );
          const qVideos = qRes.items.filter(isMediaVideoItem);

          for (const sDir of qSubDirs) {
            const sNum = extractSeasonNumber(sDir.rawName);
            const num = sNum ?? seasons.length + 1;
            const qTag = qDir.rawName.replace(/[-_]+/g, ' ').trim();
            seasons.push({
              id: sDir.url,
              seasonNumber: num,
              label: `Season ${num}`,
              qualityLabel: sDir.quality || qTag,
              url: sDir.url,
            });
          }

          // If the folder directly holds episodes without Season subfolders
          if (qSubDirs.length === 0 && qVideos.length > 0) {
            const sNum = extractSeasonNumber(qDir.rawName) ?? seasons.length + 1;
            const sortedEps = sortEpisodesList(
              qVideos.map((v, idx) => ({
                ...v,
                mediaKind: 'episode',
                season: v.season ?? sNum,
                episode: v.episode ?? idx + 1,
                cleanTitle: seriesItem.cleanTitle || v.cleanTitle,
                posterUrl: v.posterUrl || seriesItem.posterUrl,
              }))
            );
            seasons.push({
              id: qDir.url,
              seasonNumber: sNum,
              label: `Season ${sNum}`,
              qualityLabel: qDir.rawName.replace(/[-_]+/g, ' ').trim(),
              url: qDir.url,
              episodes: sortedEps,
              subtitles: qRes.subtitles,
            });
          }
        } catch {}
      })
    );
  }

  // 3. If episodes are directly in the root folder without Season subfolders:
  // ALWAYS create Season entries so user can play them
  if (seasons.length === 0 && directVideos.length > 0) {
    const bySeason = new Map<number, ParsedFtpItem[]>();
    for (const v of directVideos) {
      const sNum = v.season ?? 1;
      const list = bySeason.get(sNum) || [];
      list.push({
        ...v,
        mediaKind: 'episode',
        season: sNum,
        posterUrl: v.posterUrl || rootRes.localPosterUrl || seriesItem.posterUrl,
      });
      bySeason.set(sNum, list);
    }

    Array.from(bySeason.entries())
      .sort((a, b) => a[0] - b[0])
      .forEach(([sNum, eps]) => {
        seasons.push({
          id: `${seriesUrl}#s${sNum}`,
          seasonNumber: sNum,
          label: `Season ${sNum}`,
          url: seriesUrl,
          episodes: sortEpisodesList(eps),
          subtitles: rootRes.subtitles,
        });
      });
  }

  seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);

  let initialEpisodes: ParsedFtpItem[] = [];
  let initialSubtitles: ParsedFtpItem[] = [...rootRes.subtitles];

  if (seasons.length > 0) {
    try {
      const firstLoaded = await loadSeasonEpisodes(seasons[0], seriesItem);
      seasons[0].episodes = firstLoaded.episodes;
      seasons[0].subtitles = firstLoaded.subtitles;
      initialEpisodes = firstLoaded.episodes;
      initialSubtitles = firstLoaded.subtitles;
    } catch {}
  }

  return {
    seriesItem,
    seasons,
    initialEpisodes,
    initialSubtitles,
  };
}

export async function resolvePlayableFromFolder(folderItem: ParsedFtpItem): Promise<{
  primaryVideo: ParsedFtpItem;
  allVideos: ParsedFtpItem[];
  subtitles: ParsedFtpItem[];
  seasons?: SeasonFolderInfo[];
  folderResult: DirectoryBrowseResult;
}> {
  // 1. Instant return from cache
  const cachedUrl = getCachedPlayableUrl(folderItem.id) || getCachedPlayableUrl(folderItem.url);
  if (cachedUrl) {
    const cachedItem: ParsedFtpItem = {
      ...folderItem,
      id: cachedUrl,
      url: cachedUrl,
      isDirectory: false,
    };
    return {
      primaryVideo: cachedItem,
      allVideos: [cachedItem],
      subtitles: [],
      folderResult: {
        url: folderItem.url,
        serverName: folderItem.sourceServerName || 'CineFTP Server',
        pageTitle: folderItem.cleanTitle,
        isH5ai: true,
        isPortalRoot: false,
        parentUrl: null,
        breadcrumbs: [],
        items: [cachedItem],
        subtitles: [],
        fetchedVia: 'backend',
      },
    };
  }

  // 2. Match seed catalog if this item IS that exact seed item or has exact matching clean title
  const normTitle = folderItem.cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
  const seedMatch = INITIAL_UNIFIED_CATALOG.find(
    (s) =>
      s.id === folderItem.id ||
      s.url === folderItem.url ||
      (normTitle.length >= 3 && s.cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '') === normTitle)
  );

  if (seedMatch && !seedMatch.isDirectory && /\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(seedMatch.url)) {
    saveCachedPlayableUrl(folderItem.id, seedMatch.url);
    saveCachedPlayableUrl(folderItem.url, seedMatch.url);
    const resolvedSeed: ParsedFtpItem = {
      ...folderItem,
      ...seedMatch,
      id: seedMatch.url,
      url: seedMatch.url,
      isDirectory: false,
    };
    return {
      primaryVideo: resolvedSeed,
      allVideos: [resolvedSeed],
      subtitles: [],
      folderResult: {
        url: folderItem.url,
        serverName: folderItem.sourceServerName || seedMatch.sourceServerName || 'CineFTP Server',
        pageTitle: folderItem.cleanTitle,
        isH5ai: true,
        isPortalRoot: false,
        parentUrl: null,
        breadcrumbs: [],
        items: [resolvedSeed],
        subtitles: [],
        fetchedVia: 'backend',
      },
    };
  }

  // Ensure folder URL has trailing slash so relative paths resolve inside this folder
  const targetFolderUrl = folderItem.url.endsWith('/') ? folderItem.url : `${folderItem.url}/`;

  let dirResult: DirectoryBrowseResult | null = null;
  try {
    dirResult = await browseFtpDirectory(targetFolderUrl);
  } catch (err) {
    console.warn('Network scan of folder timed out or failed:', err);
  }

  const rawItems = dirResult?.items || [];
  let videos = rawItems.filter(isMediaVideoItem);
  const subtitles = dirResult ? [...dirResult.subtitles] : [];

  // Also check if there is a "Subs" or "Subtitles" subfolder inside the movie folder
  const subFolder = rawItems.find(
    (i) => i.isDirectory && /^(subs?|subtitles?)$/i.test(i.rawName.trim())
  );
  if (subFolder) {
    try {
      const subDirRes = await browseFtpDirectory(subFolder.url);
      subtitles.push(...subDirRes.subtitles);
    } catch {}
  }

  // If no direct video in Level 1 and it might be a TV Series or Animation series, check series seasons
  const isSeriesOrAnimation =
    folderItem.mediaKind === 'series' ||
    /series|tv|season|anime|cartoon|episodes/i.test(folderItem.url) ||
    /series|tv|season|anime|cartoon/i.test(folderItem.rawName);

  if (videos.length === 0 && isSeriesOrAnimation) {
    try {
      const seriesCheck = await crawlSeriesSeasons(folderItem);
      if (seriesCheck.initialEpisodes.length > 0) {
        const firstEp = seriesCheck.initialEpisodes[0];
        if (/\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(firstEp.url)) {
          saveCachedPlayableUrl(folderItem.id, firstEp.url);
          saveCachedPlayableUrl(folderItem.url, firstEp.url);
        }
        return {
          primaryVideo: {
            ...firstEp,
            posterUrl: firstEp.posterUrl || folderItem.posterUrl,
            backdropUrl: folderItem.backdropUrl || firstEp.backdropUrl,
            imdbRating: folderItem.imdbRating,
            plot: folderItem.plot,
            cast: folderItem.cast,
            genres: folderItem.genres,
            year: firstEp.year || folderItem.year,
          },
          allVideos: seriesCheck.initialEpisodes,
          subtitles: seriesCheck.initialSubtitles,
          seasons: seriesCheck.seasons,
          folderResult: dirResult || {
            url: targetFolderUrl,
            serverName: folderItem.sourceServerName || 'CineFTP',
            pageTitle: folderItem.cleanTitle,
            isH5ai: true,
            isPortalRoot: false,
            parentUrl: null,
            breadcrumbs: [],
            items: seriesCheck.initialEpisodes,
            subtitles: [],
            fetchedVia: 'backend',
          },
        };
      }
    } catch {}
  }

  // If no direct video in Level 1, deep-check subfolders (e.g. 1080p/, 720p/, Feature/, CD1/, Movie/)
  if (videos.length === 0 && rawItems.length > 0) {
    const subDirs = rawItems.filter(
      (i) => i.isDirectory && !/^(subs?|subtitles?|sample|extras?|featurettes?)$/i.test(i.rawName.trim())
    );
    if (subDirs.length > 0) {
      await Promise.all(
        subDirs.slice(0, 6).map(async (sd) => {
          try {
            const nestedRes = await browseFtpDirectory(sd.url);
            const nestedVideos = nestedRes.items.filter(isMediaVideoItem);
            if (nestedVideos.length > 0) {
              videos.push(...nestedVideos);
              subtitles.push(...nestedRes.subtitles);
            }
          } catch {}
        })
      );
    }
  }

  // If still no video found, check sister mirrors across the FTP cluster
  if (videos.length === 0) {
    const mirrorCandidates: string[] = [];
    if (targetFolderUrl.includes('server2.ftpbd.net')) {
      mirrorCandidates.push(targetFolderUrl.replace('server2.ftpbd.net', 'server3.ftpbd.net'));
      mirrorCandidates.push(targetFolderUrl.replace('server2.ftpbd.net', 'server5.ftpbd.net'));
      mirrorCandidates.push(targetFolderUrl.replace('server2.ftpbd.net', 'server4.ftpbd.net'));
    } else if (targetFolderUrl.includes('server3.ftpbd.net')) {
      mirrorCandidates.push(targetFolderUrl.replace('server3.ftpbd.net', 'server2.ftpbd.net'));
      mirrorCandidates.push(targetFolderUrl.replace('server3.ftpbd.net', 'server5.ftpbd.net'));
    }

    for (const mirrorUrl of mirrorCandidates) {
      try {
        const mirrorRes = await browseFtpDirectory(mirrorUrl);
        const mirrorVideos = mirrorRes.items.filter(isMediaVideoItem);
        if (mirrorVideos.length > 0) {
          videos.push(...mirrorVideos);
          subtitles.push(...mirrorRes.subtitles);
          break;
        }
      } catch {}
    }
  }

  // If no direct video in folder, try searching global verified catalogs and session cache by clean title
  if (videos.length === 0) {
    const cleanQuery = folderItem.cleanTitle.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanQuery.length >= 3) {
      // 1. Search verified initial catalog
      const globalMatch = INITIAL_UNIFIED_CATALOG.find(
        (m) =>
          !m.isDirectory &&
          /\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(m.url) &&
          m.cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanQuery
      );
      if (globalMatch) {
        videos.push({
          ...globalMatch,
          posterUrl: folderItem.posterUrl || globalMatch.posterUrl,
          backdropUrl: folderItem.backdropUrl || globalMatch.backdropUrl,
        });
      }

      // 2. Search unpacked directories across all active session sources
      if (videos.length === 0) {
        for (const items of unpackedDirCache.values()) {
          const match = items.find(
            (i) =>
              !i.isDirectory &&
              /\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(i.url) &&
              i.cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanQuery
          );
          if (match) {
            videos.push({
              ...match,
              posterUrl: folderItem.posterUrl || match.posterUrl,
              backdropUrl: folderItem.backdropUrl || match.backdropUrl,
            });
            break;
          }
        }
      }
    }
  }

  // If still no media file found after thorough scanning, return empty list cleanly without caching fake URLs
  if (videos.length === 0) {
    return {
      primaryVideo: null as any,
      allVideos: [],
      subtitles,
      folderResult: dirResult || {
        url: targetFolderUrl,
        serverName: folderItem.sourceServerName || 'CineFTP Server',
        pageTitle: folderItem.cleanTitle,
        isH5ai: true,
        isPortalRoot: false,
        parentUrl: null,
        breadcrumbs: [],
        items: [],
        subtitles: [],
        fetchedVia: 'backend',
      },
    };
  }

  // Filter out any small sample files (< 30 MB) if a full video exists
  const fullVideos = videos.filter((v) => !/sample/i.test(v.rawName) || (v.sizeBytes && v.sizeBytes > 40 * 1024 * 1024));
  const finalVideos = fullVideos.length > 0 ? fullVideos : videos;

  const hasEpisodes = finalVideos.some((v) => v.episode !== undefined);
  if (hasEpisodes) {
    finalVideos.sort((a, b) => {
      if (a.season !== b.season) return (a.season || 1) - (b.season || 1);
      if (a.episode !== b.episode) return (a.episode || 0) - (b.episode || 0);
      return a.rawName.localeCompare(b.rawName, undefined, { numeric: true });
    });
  } else {
    finalVideos.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));
  }

  const primaryVideo: ParsedFtpItem = {
    ...finalVideos[0],
    posterUrl: finalVideos[0].posterUrl || dirResult?.localPosterUrl || folderItem.posterUrl,
    backdropUrl: folderItem.backdropUrl || finalVideos[0].backdropUrl,
    imdbRating: folderItem.imdbRating,
    plot: folderItem.plot,
    cast: folderItem.cast,
    genres: folderItem.genres,
    year: finalVideos[0].year || folderItem.year,
    runtime:
      finalVideos[0].runtime ||
      folderItem.runtime ||
      (folderItem.mediaKind === 'series' || finalVideos[0].mediaKind === 'episode'
        ? '45 min'
        : '2h 05m'),
  };

  if (/\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(primaryVideo.url)) {
    saveCachedPlayableUrl(folderItem.id, primaryVideo.url);
    saveCachedPlayableUrl(folderItem.url, primaryVideo.url);
  }

  return {
    primaryVideo,
    allVideos: finalVideos,
    subtitles,
    folderResult: dirResult || {
      url: targetFolderUrl,
      serverName: folderItem.sourceServerName || 'CineFTP Server',
      pageTitle: folderItem.cleanTitle,
      isH5ai: true,
      isPortalRoot: false,
      parentUrl: null,
      breadcrumbs: [],
      items: finalVideos,
      subtitles,
      fetchedVia: 'backend',
    },
  };
}

export function isVercelHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host.includes('vercel.app') || host.includes('vercel.com');
}

export async function probeVideoStreams(videoUrl: string): Promise<MediaProbeInfo | null> {
  try {
    const res = await fetch(`/api/probe?url=${encodeURIComponent(videoUrl)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return data as MediaProbeInfo;
  } catch {
    return null;
  }
}

export function buildStreamUrl(options: {
  videoUrl: string;
  mode: 'direct-proxy' | 'ffmpeg-remux' | 'raw-direct';
  audioTrack?: number;
  startSeconds?: number;
  reencodeVideo?: boolean;
}): string {
  const { videoUrl, mode, audioTrack = 0, startSeconds = 0, reencodeVideo = false } = options;

  const effectiveUrl = videoUrl;

  if (mode === 'raw-direct') {
    return effectiveUrl;
  }

  const useLocalBridge = isLocalBridgeAvailable && isPrivateOrBdixUrl(videoUrl);
  const base = useLocalBridge ? LOCAL_BRIDGE_BASE : '/api';

  if (mode === 'ffmpeg-remux') {
    const params = new URLSearchParams({
      url: effectiveUrl,
      audioTrack: String(audioTrack),
      start: String(Math.floor(startSeconds)),
    });
    if (reencodeVideo) params.set('reencode', '1');
    return `${base}/transcode?${params.toString()}`;
  }

  return `${base}/stream?url=${encodeURIComponent(effectiveUrl)}`;
}
