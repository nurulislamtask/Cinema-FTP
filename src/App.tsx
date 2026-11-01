import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { AppSource, ActiveNav, RecentlyPlayedEntry } from './types/cineftp';
import { ParsedFtpItem } from './utils/ftpParser';
import {
  browseFtpDirectory,
  browseDirectoryWithDeepScan,
  EnrichedMetadata,
  SeasonFolderInfo,
  resolvePlayableFromFolder,
  getCachedPlayableUrl,
  saveCachedPlayableUrl,
} from './services/ftpClient';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { CatalogView } from './components/CatalogView';
import { MediaDetailView } from './components/MediaDetailView';
import { SettingsView } from './components/SettingsView';
import { CinemaPlayer } from './components/PlayerEntry';
import { AiAssistantModal } from './components/AiAssistantModal';
import { MobileBottomNav } from './components/MobileBottomNav';

const INITIAL_SOURCES: AppSource[] = [
  {
    id: 'src-lan-english-movies',
    name: 'English Movies',
    url: 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/',
    type: 'movies',
    count: 0,
    lastSynced: 'Just now',
    status: 'online',
  },
  {
    id: 'src-lan-english-1080p',
    name: 'English Movies · 1080p',
    url: 'http://172.16.50.14/DHAKA-FLIX-14/English%20Movies%20%281080p%29/',
    type: 'movies',
    count: 0,
    lastSynced: 'Just now',
    status: 'online',
  },
  {
    id: 'src-lan-hindi-movies',
    name: 'Hindi Movies',
    url: 'http://172.16.50.14/DHAKA-FLIX-14/Hindi%20Movies/',
    type: 'movies',
    count: 0,
    lastSynced: 'Just now',
    status: 'online',
  },
  {
    id: 'src-lan-hindi-dubbed',
    name: 'Hindi Dubbed · South',
    url: 'http://172.16.50.14/DHAKA-FLIX-14/SOUTH%20INDIAN%20MOVIES/Hindi%20Dubbed/',
    type: 'movies',
    count: 0,
    lastSynced: 'Just now',
    status: 'online',
  },
  {
    id: 'src-lan-south-movies',
    name: 'South Indian Movies',
    url: 'http://172.16.50.14/DHAKA-FLIX-14/SOUTH%20INDIAN%20MOVIES/South%20Movies/',
    type: 'movies',
    count: 0,
    lastSynced: 'Just now',
    status: 'online',
  },
  {
    id: 'src-lan-kolkata-bangla',
    name: 'Bangla Movies · Kolkata',
    url: 'http://172.16.50.7/DHAKA-FLIX-7/Kolkata%20Bangla%20Movies/',
    type: 'movies',
    count: 0,
    lastSynced: 'Just now',
    status: 'online',
  },
  {
    id: 'src-lan-foreign-movies',
    name: 'Foreign Language Movies',
    url: 'http://172.16.50.7/DHAKA-FLIX-7/Foreign%20Language%20Movies/',
    type: 'movies',
    count: 0,
    lastSynced: 'Just now',
    status: 'online',
  },
  {
    id: 'src-lan-3d-movies',
    name: '3D Movies',
    url: 'http://172.16.50.7/DHAKA-FLIX-7/3D%20Movies/',
    type: 'movies',
    count: 0,
    lastSynced: 'Just now',
    status: 'online',
  },
  {
    id: 'src-lan-animation-movies',
    name: 'Animation Movies',
    url: 'http://172.16.50.14/DHAKA-FLIX-14/Animation%20Movies/',
    type: 'movies',
    count: 0,
    lastSynced: 'Just now',
    status: 'online',
  },
  {
    id: 'src-lan-animation-1080p',
    name: 'Animation Movies · 1080p',
    url: 'http://172.16.50.14/DHAKA-FLIX-14/Animation%20Movies%20%281080p%29/',
    type: 'movies',
    count: 0,
    lastSynced: 'Just now',
    status: 'online',
  },
  {
    id: 'src-lan-tv-web-series',
    name: 'TV & Web Series',
    url: 'http://172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series/',
    type: 'series',
    count: 0,
    lastSynced: 'Just now',
    status: 'online',
  },
  {
    id: 'src-lan-korean-series',
    name: 'Korean TV & Web Series',
    url: 'http://172.16.50.14/DHAKA-FLIX-14/KOREAN%20TV%20%26%20WEB%20Series/',
    type: 'series',
    count: 0,
    lastSynced: 'Just now',
    status: 'online',
  },
  {
    id: 'src-lan-anime-cartoon',
    name: 'Anime & Cartoon Series',
    url: 'http://172.16.50.10/DHAKA-FLIX-10/Anime%20%26%20Cartoon%20TV%20Series/',
    type: 'series',
    count: 0,
    lastSynced: 'Just now',
    status: 'online',
  },
  {
    id: 'src-lan-documentary',
    name: 'Documentaries',
    url: 'http://172.16.50.10/DHAKA-FLIX-10/Documentary/',
    type: 'movies',
    count: 0,
    lastSynced: 'Just now',
    status: 'online',
  },
  {
    id: 'src-lan-wrestling',
    name: 'WWE & AEW Wrestling',
    url: 'http://172.16.50.10/DHAKA-FLIX-10/WWE%20%26%20AEW%20Wrestling/',
    type: 'series',
    count: 0,
    lastSynced: 'Just now',
    status: 'online',
  },
];

import {
  SEED_SERIES_CATALOG,
  INITIAL_UNIFIED_CATALOG,
} from './utils/seedData';


// ---- Duplicate titles (same movie/series found in several sources or quality folders) ----
function qualityRank(item: ParsedFtpItem): number {
  const t = `${item.quality || ''} ${item.rawName || ''} ${item.url || ''}`.toLowerCase();
  if (/2160p|\b4k\b|uhd/.test(t)) return 4;
  if (/1080p/.test(t)) return 3;
  if (/720p/.test(t)) return 2;
  if (/480p|360p|dvdrip|hdcam|cam\b/.test(t)) return 1;
  return 0;
}

function dedupeTitle(items: ParsedFtpItem[]): ParsedFtpItem[] {
  const index = new Map<string, number>();
  const out: ParsedFtpItem[] = [];
  for (const item of items) {
    // Only whole titles are merged; episodes / files / subtitles / folders are left alone
    const isSeries = item.mediaKind === 'series';
    if (item.mediaKind !== 'movie' && !isSeries) {
      out.push(item);
      continue;
    }
    const norm = (item.cleanTitle || item.rawName || '')
      .toLowerCase()
      .replace(/\(.*?\)|\[.*?\]/g, ' ')
      .replace(/[^a-z0-9\u0980-\u09ff\u0900-\u097f]+/g, '');
    if (norm.length < 2) {
      out.push(item);
      continue;
    }
    const key = `${isSeries ? 'tv' : 'mv'}|${norm}|${isSeries ? '' : item.year || ''}`;
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, out.length);
      out.push(item);
    } else if (qualityRank(item) > qualityRank(out[at])) {
      out[at] = item; // keep the best quality at the original position
    }
  }
  return out;
}

export default function App() {
  const [activeNav, setActiveNav] = useState<ActiveNav>('home');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sources, setSources] = useState<AppSource[]>(() => {
    try {
      // v10: new default = direct DhakaFlix LAN sources (older saved lists are not reused)
      const raw = localStorage.getItem('cineftp_sources_v10');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_SOURCES;
  });

  // Stable signature of the source list (ignores count/lastSynced changes so a count update never restarts a scan)
  const sourcesKey = useMemo(
    () => sources.map((s) => `${s.id}|${s.url}|${s.type}`).join('\n'),
    [sources]
  );
  // Increments on every navigation: results from an older, still-running scan are ignored
  const loadIdRef = useRef(0);

  const updateSourceCount = useCallback((url: string, count: number) => {
    if (!count) return;
    setSources((prev) => {
      if (!prev.some((s) => s.url === url && s.count !== count)) return prev;
      const next = prev.map((s) => (s.url === url ? { ...s, count, lastSynced: 'Just now' } : s));
      try {
        localStorage.setItem('cineftp_sources_v10', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const [catalogItems, setCatalogItems] = useState<ParsedFtpItem[]>(INITIAL_UNIFIED_CATALOG);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeepScanning, setIsDeepScanning] = useState(false);
  const [deepScanProgressText, setDeepScanProgressText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Folder Navigation State
  const [folderBreadcrumbs, setFolderBreadcrumbs] = useState<{ label: string; url: string }[]>([]);
  const [hasSubfolders, setHasSubfolders] = useState(false);
  const [isUnpackMode, setIsUnpackMode] = useState(true);

  // Watchlist & Recently Played
  const [watchlist, setWatchlist] = useState<ParsedFtpItem[]>(() => {
    try {
      const raw = localStorage.getItem('cineftp_watchlist_v6');
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  });

  const [recentlyPlayed, setRecentlyPlayed] = useState<RecentlyPlayedEntry[]>(() => {
    try {
      const raw = localStorage.getItem('cineftp_recent_v6');
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  });

  // Selected Detail View
  const [selectedMediaItem, setSelectedMediaItem] = useState<{
    item: ParsedFtpItem;
    meta?: EnrichedMetadata | null;
  } | null>(null);

  // Active Cinema Video Player
  const [activePlayerState, setActivePlayerState] = useState<{
    video: ParsedFtpItem;
    playlist: ParsedFtpItem[];
    subtitles: ParsedFtpItem[];
    seasons?: SeasonFolderInfo[];
    initialStartTime?: number;
  } | null>(null);

  // AI Assistant Modal
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  // Save sources on change
  const saveSources = (updated: AppSource[]) => {
    setSources(updated);
    try {
      localStorage.setItem('cineftp_sources_v10', JSON.stringify(updated));
    } catch {}
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const watchlistSet = useMemo(() => {
    return new Set(watchlist.map((w) => w.id));
  }, [watchlist]);

  const toggleWatchlist = (item: ParsedFtpItem) => {
    setWatchlist((prev) => {
      const exists = prev.some((i) => i.id === item.id);
      const next = exists ? prev.filter((i) => i.id !== item.id) : [item, ...prev];
      try {
        localStorage.setItem('cineftp_watchlist_v6', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const recordRecentlyPlayed = (video: ParsedFtpItem, playlist: ParsedFtpItem[]) => {
    setRecentlyPlayed((prev) => {
      const next = [
        {
          id: video.id,
          video,
          playlist,
          subtitles: [],
          currentTime: 0,
          duration: 0,
          updatedAt: Date.now(),
        },
        ...prev.filter((p) => p.id !== video.id),
      ].slice(0, 30);
      try {
        localStorage.setItem('cineftp_recent_v6', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Helper to load directory items
  const loadDirectory = useCallback(async (url: string, unpack = true, isRootSource = false) => {
    const myLoadId = ++loadIdRef.current;
    const alive = () => loadIdRef.current === myLoadId;
    setIsLoading(true);
    setIsDeepScanning(false);
    setDeepScanProgressText('');

    const isSeries = /series|tv|anime|cartoon|drama|ftp-4/i.test(url);

    try {
      if (unpack) {
        setIsDeepScanning(true);
        // Deep scan with progressive streaming so movies show up immediately!
        const deepRes: any = await browseDirectoryWithDeepScan(
          url,
          (count, name) => {
            if (alive()) setDeepScanProgressText(`Auto-indexing ${name} (${count} ${isSeries ? 'series' : 'movies'} loaded)...`);
          },
          (streamedChunk) => {
            if (isRootSource && isSeries) {
              const merged = [...SEED_SERIES_CATALOG];
              streamedChunk.forEach((item) => {
                if (!merged.some((m) => m.cleanTitle.toLowerCase() === item.cleanTitle.toLowerCase())) {
                  merged.push(item);
                }
              });
              if (alive()) setCatalogItems(merged);
            } else {
              if (alive()) setCatalogItems(streamedChunk);
            }
          }
        );
        if (!alive()) return;
        // Always show the final full list (even if streaming callbacks were skipped) and refresh the source count
        if (deepRes.unpackedItems?.length > 0 && !(isRootSource && isSeries)) {
          setCatalogItems(deepRes.unpackedItems);
        }
        if (isRootSource) updateSourceCount(url, deepRes.totalEstimatedCount || deepRes.unpackedItems?.length || 0);
        setHasSubfolders(deepRes.hasSubfolders);
        setIsUnpackMode(deepRes.hasSubfolders);
      } else {
        const res = await browseFtpDirectory(url);
        const subfolders = res.items.filter((i) => i.isDirectory);
        const hasSub = subfolders.length > 0;
        setHasSubfolders(hasSub);
        setIsUnpackMode(false);

        // If it's a TV series root, merge with the pristine seed series catalog
        if (isRootSource && isSeries) {
          const merged = [...SEED_SERIES_CATALOG];
          res.items.forEach((item) => {
            if (!merged.some((m) => m.cleanTitle.toLowerCase() === item.cleanTitle.toLowerCase())) {
              merged.push(item);
            }
          });
          if (alive()) setCatalogItems(merged);
        } else {
          if (alive()) setCatalogItems(res.items);
        }
      }
    } catch (err) {
      console.warn('Could not load directory:', err);
    } finally {
      if (alive()) {
        setIsLoading(false);
        setIsDeepScanning(false);
      }
    }
  }, [updateSourceCount]);

  // Load & Aggregate multiple sources together (for Home, All Movies, All TV Shows)
  const loadMultiSourceGroup = useCallback(
    async (targetSources: AppSource[], groupTitle: string, isSeriesGroup = false) => {
      const myLoadId = ++loadIdRef.current;
      const alive = () => loadIdRef.current === myLoadId;
      setIsLoading(true);
      setIsDeepScanning(true);
      setDeepScanProgressText(`Aggregating library across ${targetSources.length} servers...`);
      setFolderBreadcrumbs([{ label: groupTitle, url: groupTitle }]);
      setIsUnpackMode(true);
      setHasSubfolders(false);

      // Pre-seed with unified catalog on home, or series on series group, or movies on movies group
      let combined: ParsedFtpItem[] = groupTitle.toLowerCase().includes('home')
        ? [...INITIAL_UNIFIED_CATALOG]
        : isSeriesGroup
        ? [...SEED_SERIES_CATALOG]
        : [...INITIAL_UNIFIED_CATALOG.filter((i) => i.mediaKind === 'movie')];
      const seenIds = new Set<string>(combined.map((i) => i.id));
      if (alive()) setCatalogItems([...combined]);

      let finishedCount = 0;
      await Promise.all(
        targetSources.map(async (src) => {
          try {
            const scanRes = await browseDirectoryWithDeepScan(
              src.url,
              (count, name) => {
                if (alive()) setDeepScanProgressText(`Scanning ${src.name}: ${name} (${count} items)...`);
              },
              (streamedChunk) => {
                let addedAny = false;
                for (const item of streamedChunk) {
                  if (!seenIds.has(item.id)) {
                    seenIds.add(item.id);
                    const isSeries = src.type === 'series' || /series|tv|anime|drama/i.test(src.url);
                    combined.push({
                      ...item,
                      mediaKind:
                        item.mediaKind === 'generic_folder'
                          ? isSeries
                            ? 'series'
                            : 'movie'
                          : item.mediaKind,
                      sourceServerName: src.name,
                      sourceServerUrl: src.url,
                    });
                    addedAny = true;
                  }
                }
                if (addedAny && alive()) {
                  setCatalogItems([...combined]);
                }
              }
            );
            updateSourceCount(src.url, scanRes.totalEstimatedCount || scanRes.unpackedItems.length);
          } catch (err) {
            console.warn(`Could not load ${src.name}:`, err);
          } finally {
            finishedCount++;
            if (alive()) setDeepScanProgressText(
              `Indexed ${finishedCount}/${targetSources.length} servers (${combined.length} titles)...`
            );
          }
        })
      );

      if (alive()) {
        setIsLoading(false);
        setIsDeepScanning(false);
      }
    },
    [updateSourceCount]
  );

  // Fetch items whenever activeNav changes
  useEffect(() => {
    setSelectedMediaItem(null); // Clear detail view on section switch
    loadIdRef.current++; // cancel any older scan still streaming results

    if (activeNav === 'settings') return;

    if (activeNav === 'watchlist') {
      setCatalogItems(watchlist);
      setFolderBreadcrumbs([{ label: 'Watchlist', url: 'watchlist' }]);
      setHasSubfolders(false);
      return;
    }

    if (activeNav === 'recent') {
      setCatalogItems(recentlyPlayed.map((r) => r.video));
      setFolderBreadcrumbs([{ label: 'Recently Played', url: 'recent' }]);
      setHasSubfolders(false);
      return;
    }

    // 1. Home Navigation: Combine ALL movies & series from all servers
    if (activeNav === 'home') {
      loadMultiSourceGroup(sources, 'Home — All Movies & Series', false);
      return;
    }

    // 2. Movies Navigation: Combine ALL movie sources together
    if (activeNav === 'movies') {
      const movieSources = sources.filter((s) => s.type === 'movies');
      loadMultiSourceGroup(movieSources, 'All Movies', false);
      return;
    }

    // 3. TV Shows Navigation: Combine ALL TV series sources together
    if (activeNav === 'series') {
      const seriesSources = sources.filter((s) => s.type === 'series');
      loadMultiSourceGroup(seriesSources, 'All TV Shows & Series', true);
      return;
    }

    // 4. Individual Source clicked under "SOURCES"
    if (typeof activeNav === 'object' && activeNav.type === 'source') {
      const targetSource = sources.find((s) => s.id === activeNav.sourceId);
      if (!targetSource) return;
      setFolderBreadcrumbs([{ label: targetSource.name, url: targetSource.url }]);
      setIsUnpackMode(true);
      loadDirectory(targetSource.url, true, true);
      return;
    }
  }, [activeNav, watchlist, recentlyPlayed, sourcesKey, loadDirectory, loadMultiSourceGroup]);

  // Navigate INTO a subfolder (e.g. clicking 2026/ or Korean-Language/)
  const handleOpenFolder = (folderUrl: string, folderTitle: string) => {
    setFolderBreadcrumbs((prev) => [...prev, { label: folderTitle, url: folderUrl }]);
    setIsUnpackMode(true);
    loadDirectory(folderUrl, true, false);
  };

  // Navigate via Breadcrumb click
  const handleNavigateBreadcrumb = (index: number) => {
    if (index >= folderBreadcrumbs.length) return;
    const target = folderBreadcrumbs[index];
    const newCrumbs = folderBreadcrumbs.slice(0, index + 1);
    setFolderBreadcrumbs(newCrumbs);
    setIsUnpackMode(true);
    loadDirectory(target.url, true, newCrumbs.length === 1);
  };

  // Toggle Unpack Mode (Deep Scan vs Raw Folders)
  const handleToggleUnpackMode = () => {
    const currentCrumb = folderBreadcrumbs[folderBreadcrumbs.length - 1];
    if (!currentCrumb) return;
    const nextMode = !isUnpackMode;
    setIsUnpackMode(nextMode);
    loadDirectory(currentCrumb.url, nextMode, folderBreadcrumbs.length === 1);
  };

  // Handle Play Direct from Card or Detail
  const handlePlayDirect = async (item: ParsedFtpItem, _meta?: EnrichedMetadata | null) => {
    // 1. If it's already a direct video file, launch player immediately with 0ms delay!
    const isDirectVideo = /\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(item.url);
    if (isDirectVideo) {
      const directItem: ParsedFtpItem = { ...item, isDirectory: false };
      recordRecentlyPlayed(directItem, [directItem]);
      setActivePlayerState({
        video: directItem,
        playlist: [directItem],
        subtitles: [],
        initialStartTime: 0,
      });
      return;
    }

    // 2. If stream link was cached, launch player immediately with zero waiting!
    const cachedUrl = getCachedPlayableUrl(item.id) || getCachedPlayableUrl(item.url);
    if (cachedUrl) {
      const directItem: ParsedFtpItem = { ...item, url: cachedUrl, isDirectory: false };
      recordRecentlyPlayed(directItem, [directItem]);
      setActivePlayerState({
        video: directItem,
        playlist: [directItem],
        subtitles: [],
        initialStartTime: 0,
      });
      return;
    }

    const isFolder =
      item.isDirectory ||
      item.url.endsWith('/') ||
      !isDirectVideo;

    if (isFolder) {
      setIsLoading(true);
      try {
        const playable = await resolvePlayableFromFolder(item);
        const resolvedVideo =
          (playable.primaryVideo &&
            !playable.primaryVideo.isDirectory &&
            /\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(playable.primaryVideo.url) &&
            playable.primaryVideo) ||
          playable.allVideos.find((v) => !v.isDirectory && /\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(v.url));

        if (resolvedVideo) {
          saveCachedPlayableUrl(item.id, resolvedVideo.url);
          saveCachedPlayableUrl(item.url, resolvedVideo.url);
          recordRecentlyPlayed(resolvedVideo, playable.allVideos.length > 0 ? playable.allVideos : [resolvedVideo]);
          setActivePlayerState({
            video: resolvedVideo,
            playlist: playable.allVideos.length > 0 ? playable.allVideos : [resolvedVideo],
            subtitles: playable.subtitles,
            seasons: playable.seasons,
            initialStartTime: 0,
          });
          return;
        } else {
          // Launch player directly: backend /api/stream proxy crawls folder and streams the video!
          recordRecentlyPlayed(item, [item]);
          setActivePlayerState({
            video: item,
            playlist: [item],
            subtitles: playable.subtitles || [],
            seasons: playable.seasons,
            initialStartTime: 0,
          });
          return;
        }
      } catch (err) {
        console.warn('Failed to resolve folder media, launching with proxy:', err);
        recordRecentlyPlayed(item, [item]);
        setActivePlayerState({
          video: item,
          playlist: [item],
          subtitles: [],
          initialStartTime: 0,
        });
        return;
      } finally {
        setIsLoading(false);
      }
    }

    // Only launch player if this item is a direct video
    if (isDirectVideo) {
      recordRecentlyPlayed(item, [item]);
      setActivePlayerState({
        video: item,
        playlist: [item],
        subtitles: [],
        initialStartTime: 0,
      });
    } else {
      setSelectedMediaItem({ item, meta: _meta || null });
    }
  };

  // Add source in Settings (with Deep Scan to get accurate movie count!)
  const handleAddSource = async (newSrc: { name: string; url: string; type: 'movies' | 'series' }) => {
    const created: AppSource = {
      id: `src-${Date.now()}`,
      name: newSrc.name,
      url: newSrc.url,
      type: newSrc.type,
      count: 0,
      lastSynced: 'Just now',
      status: 'online',
    };

    try {
      // Run deep scan so count reflects actual movies inside subfolders!
      const deepRes = await browseDirectoryWithDeepScan(newSrc.url);
      created.count = deepRes.totalEstimatedCount || deepRes.unpackedItems.length;
    } catch {
      try {
        const res = await browseFtpDirectory(newSrc.url, true);
        created.count = res.items.length;
      } catch {}
    }

    saveSources([created, ...sources]);
  };

  const handleRemoveSource = (id: string) => {
    saveSources(sources.filter((s) => s.id !== id));
  };

  const handleSyncSource = async (id: string) => {
    const src = sources.find((s) => s.id === id);
    if (!src) return;
    try {
      const deepRes = await browseDirectoryWithDeepScan(src.url);
      const totalCount = deepRes.totalEstimatedCount || deepRes.unpackedItems.length;
      const updated = sources.map((s) =>
        s.id === id ? { ...s, count: totalCount || s.count, lastSynced: 'Just now' } : s
      );
      saveSources(updated);
    } catch {}
  };

  const handleSyncAll = async () => {
    setIsSyncingAll(true);
    try {
      for (const src of sources.slice(0, 5)) {
        await handleSyncSource(src.id);
      }
    } finally {
      setIsSyncingAll(false);
    }
  };

  // Filter items by search query if present
  const displayedCatalog = useMemo(() => {
    // Merge duplicates only where the list is a library of titles (not while browsing inside a folder of files)
    const isTitleLibrary =
      activeNav === 'home' ||
      activeNav === 'movies' ||
      activeNav === 'series' ||
      (typeof activeNav === 'object' && isUnpackMode);
    const base = isTitleLibrary ? dedupeTitle(catalogItems) : catalogItems;
    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase();
    return base.filter(
      (i) =>
        i.cleanTitle.toLowerCase().includes(q) ||
        i.rawName.toLowerCase().includes(q) ||
        (i.year && String(i.year).includes(q))
    );
  }, [catalogItems, searchQuery, activeNav, isUnpackMode]);

  // Current page title
  const currentTitle = useMemo(() => {
    if (typeof activeNav === 'string') {
      if (activeNav === 'home') return 'Home — All Movies & Series';
      if (activeNav === 'movies') return 'All Movies';
      if (activeNav === 'series') return 'All TV Shows & Series';
      if (activeNav === 'watchlist') return 'Watchlist';
      if (activeNav === 'recent') return 'Recently Played';
    }
    if (folderBreadcrumbs.length > 0) {
      return folderBreadcrumbs[folderBreadcrumbs.length - 1].label;
    }
    if (typeof activeNav === 'object' && activeNav.type === 'source') {
      const src = sources.find((s) => s.id === activeNav.sourceId);
      if (src) return src.name;
    }
    return 'Catalog';
  }, [folderBreadcrumbs, activeNav, sources]);

  const totalMoviesCount = useMemo(() => {
    const sum = sources
      .filter((s) => s.type === 'movies')
      .reduce((acc, s) => acc + (s.count || 0), 0);
    return sum || 11575;
  }, [sources]);

  const totalSeriesCount = useMemo(() => {
    const sum = sources
      .filter((s) => s.type === 'series')
      .reduce((acc, s) => acc + (s.count || 0), 0);
    return sum || 767;
  }, [sources]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#090A0F] text-zinc-100 font-sans selection:bg-amber-500 selection:text-black">
      {/* 1. Left Sidebar (Matching Screenshot 1, 2, 3) */}
      <Sidebar
        activeNav={activeNav}
        onNavigate={(nav) => {
          setActiveNav(nav);
          setSelectedMediaItem(null);
        }}
        sources={sources}
        moviesCount={totalMoviesCount}
        seriesCount={totalSeriesCount}
        recentCount={recentlyPlayed.length || 2}
        watchlistCount={watchlist.length}
        onAddSourceClick={() => {
          setActiveNav('settings');
          setSelectedMediaItem(null);
        }}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* 2. Main Center Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#090A0F] relative">
        {/* Top Search & Status Bar (Matching Screenshot 1, 2, 3) */}
        <TopBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          syncProgress={{
            isSyncing: isLoading || isDeepScanning || isSyncingAll,
            current: 1215,
            total: 1534,
          }}
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
        />

        {/* View Switcher: Detail View, Settings, or Catalog Grid */}
        {selectedMediaItem ? (
          /* Media Detail View (Matching Screenshot 2) */
          <MediaDetailView
            item={selectedMediaItem.item}
            enrichedMeta={selectedMediaItem.meta}
            onBack={() => setSelectedMediaItem(null)}
            onPlayItem={async (video, playlist, subtitles, seasons) => {
              let playVideo = video;
              let playList = playlist;
              let playSubs = subtitles;
              let playSeasons = seasons;

              const isFolder =
                video.isDirectory ||
                video.url.endsWith('/') ||
                !/\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(video.url);

              if (isFolder) {
                const cached = getCachedPlayableUrl(video.id) || getCachedPlayableUrl(video.url);
                if (cached) {
                  playVideo = { ...video, url: cached, isDirectory: false };
                  playList = [playVideo];
                } else {
                  try {
                    const resolved = await resolvePlayableFromFolder(video);
                    if (resolved.primaryVideo) {
                      playVideo = resolved.primaryVideo;
                      playList = resolved.allVideos.length > 0 ? resolved.allVideos : [resolved.primaryVideo];
                      playSubs = resolved.subtitles || subtitles;
                      playSeasons = resolved.seasons || seasons;
                      saveCachedPlayableUrl(video.id, resolved.primaryVideo.url);
                      saveCachedPlayableUrl(video.url, resolved.primaryVideo.url);
                    }
                  } catch {}
                }
              }

              recordRecentlyPlayed(playVideo, playList);
              setActivePlayerState({
                video: playVideo,
                playlist: playList.length > 0 ? playList : [playVideo],
                subtitles: playSubs,
                seasons: playSeasons,
              });
            }}
            isSaved={watchlistSet.has(selectedMediaItem.item.id)}
            onToggleWatchlist={toggleWatchlist}
          />
        ) : activeNav === 'settings' ? (
          /* Settings View (Matching Screenshot 1) */
          <SettingsView
            sources={sources}
            onAddSource={handleAddSource}
            onRemoveSource={handleRemoveSource}
            onSyncSource={handleSyncSource}
            onSyncAll={handleSyncAll}
            isSyncingAll={isSyncingAll}
          />
        ) : (
          /* Catalog Browse Grid (Matching Screenshot 3) */
          <CatalogView
            title={currentTitle}
            items={displayedCatalog}
            isLoading={isLoading}
            isDeepScanning={isDeepScanning}
            deepScanProgressText={deepScanProgressText}
            breadcrumbs={folderBreadcrumbs}
            onNavigateBreadcrumb={handleNavigateBreadcrumb}
            onOpenFolder={handleOpenFolder}
            onRefresh={() => {
              if (activeNav === 'home') {
                loadMultiSourceGroup(sources, 'Home — All Movies & Series', true);
              } else if (activeNav === 'movies') {
                loadMultiSourceGroup(sources.filter((s) => s.type === 'movies'), 'All Movies', false);
              } else if (activeNav === 'series') {
                loadMultiSourceGroup(sources.filter((s) => s.type === 'series'), 'All TV Shows & Series', true);
              } else {
                const crumb = folderBreadcrumbs[folderBreadcrumbs.length - 1];
                if (crumb) loadDirectory(crumb.url, isUnpackMode);
              }
            }}
            onSelectMedia={(item, meta) => {
              if (item.isDirectory && (item.mediaKind === 'year_folder' || item.mediaKind === 'category_folder')) {
                handleOpenFolder(item.url, item.cleanTitle);
              } else {
                setSelectedMediaItem({ item, meta });
              }
            }}
            onPlayDirect={handlePlayDirect}
            watchlistSet={watchlistSet}
            onToggleWatchlist={toggleWatchlist}
            hasSubfolders={hasSubfolders}
            isUnpackMode={isUnpackMode}
            onToggleUnpackMode={handleToggleUnpackMode}
            isHome={activeNav === 'home'}
            onNavigateSection={(sec) => {
              setActiveNav(sec);
            }}
          />
        )}

        {/* Floating Bottom-Right Yellow Sparkles Button (FAB) */}
        <button
          onClick={() => setIsAiModalOpen(true)}
          className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 w-11 sm:w-12 h-11 sm:h-12 rounded-full bg-[#E5A00D] hover:bg-[#F59E0B] text-black flex items-center justify-center shadow-2xl transition-transform hover:scale-110 active:scale-95 cursor-pointer z-40 border border-amber-300/30"
          title="Open AI Cinema Assistant"
        >
          <Sparkles className="w-5 h-5 fill-black" />
        </button>

        {/* Native Mobile Bottom Navigation Bar */}
        <MobileBottomNav
          activeNav={activeNav}
          onNavigate={(nav) => {
            setActiveNav(nav);
            setSelectedMediaItem(null);
          }}
          watchlistCount={watchlist.length}
        />
      </main>

      {/* Fullscreen Multi-Audio Cinema Player */}
      {activePlayerState && (
        <CinemaPlayer
          video={activePlayerState.video}
          playlist={activePlayerState.playlist}
          subtitles={activePlayerState.subtitles}
          seasons={activePlayerState.seasons}
          initialStartTime={activePlayerState.initialStartTime || 0}
          onClose={() => setActivePlayerState(null)}
          onSelectVideo={(nextVid) => {
            setActivePlayerState((prev) =>
              prev ? { ...prev, video: nextVid, initialStartTime: 0 } : null
            );
          }}
        />
      )}

      {/* Floating AI Cinema Assistant Modal */}
      <AiAssistantModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        libraryTitles={catalogItems.map((i) => i.cleanTitle)}
        onSelectTitle={(t) => {
          setSearchQuery(t);
          setIsAiModalOpen(false);
        }}
      />
    </div>
  );
}
