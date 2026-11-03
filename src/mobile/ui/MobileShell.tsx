import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ParsedFtpItem } from '../../utils/ftpParser';
import { AppSource, RecentlyPlayedEntry } from '../../types/cineftp';
import { EnrichedMetadata } from '../../services/ftpClient';
import { MediaDetailView } from '../../components/MediaDetailView';
import { registerBack } from '../backStack';
import { useLibrary } from '../useLibrary';
import { usePrefs } from '../prefs';
import { BottomNav } from './BottomNav';
import { HomeTab } from './HomeTab';
import { BrowseTab } from './BrowseTab';
import { ListTab } from './ListTab';
import { MoreTab } from './MoreTab';
import { SearchOverlay } from './SearchOverlay';
import { ShellApi, Tab } from './types';

export interface MobileShellProps {
  sources: AppSource[];
  watchlist: ParsedFtpItem[];
  recentlyPlayed: RecentlyPlayedEntry[];
  watchlistSet: Set<string>;
  onToggleWatchlist: (item: ParsedFtpItem) => void;
  selected: { item: ParsedFtpItem; meta?: EnrichedMetadata | null } | null;
  setSelected: (s: { item: ParsedFtpItem; meta?: EnrichedMetadata | null } | null) => void;
  onPlayDirect: (item: ParsedFtpItem, meta?: EnrichedMetadata | null) => void;
  onDetailPlay: React.ComponentProps<typeof MediaDetailView>['onPlayItem'];
  playerOpen: boolean;
  busy: boolean;
  onAddSource: (s: { name: string; url: string; type: 'movies' | 'series' }) => Promise<void>;
  onRemoveSource: (id: string) => void;
  onSyncSource: (id: string) => Promise<void>;
  onClearHistory: () => void;
}

/** The phone app's own interface (the PC app keeps its original layout). */
export const MobileShell: React.FC<MobileShellProps> = (props) => {
  const [tab, setTab] = useState<Tab>('home');
  const [searchOpen, setSearchOpen] = useState(false);
  const [prefs, setPrefs] = usePrefs();
  const lib = useLibrary(props.sources);
  const [resumeTick, setResumeTick] = useState(0);

  // refresh "Continue watching" every time the player closes
  useEffect(() => {
    if (!props.playerOpen) setResumeTick((n) => n + 1);
  }, [props.playerOpen]);

  // Back button / Esc: close the top layer first (search, details, other tab), leave the app only from Home
  const live = useRef({ tab, searchOpen, selected: props.selected, setSelected: props.setSelected });
  live.current = { tab, searchOpen, selected: props.selected, setSelected: props.setSelected };
  useEffect(
    () =>
      registerBack(() => {
        const L = live.current;
        if (L.searchOpen) { setSearchOpen(false); return true; }
        if (L.selected) { L.setSelected(null); return true; }
        if (L.tab !== 'home') { setTab('home'); return true; }
        return false;
      }),
    []
  );

  const api: ShellApi = useMemo(
    () => ({
      library: lib.items,
      sources: props.sources,
      watchlist: props.watchlist,
      recent: props.recentlyPlayed,
      isSaved: (id) => props.watchlistSet.has(id),
      toggleSave: props.onToggleWatchlist,
      openDetails: (item, meta) => props.setSelected({ item, meta }),
      play: (item, meta) => props.onPlayDirect(item, meta),
      goTab: setTab,
      openSearch: () => setSearchOpen(true),
      resumeTick,
    }),
    [lib.items, props.sources, props.watchlist, props.recentlyPlayed, props.watchlistSet, resumeTick]
  );

  const changeTab = useCallback((t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <div className="h-screen w-screen overflow-y-auto overflow-x-hidden bg-[#07080C] pb-24 text-zinc-100" style={{ WebkitOverflowScrolling: 'touch' }}>
      {tab === 'home' && <HomeTab api={api} prefs={prefs} scanning={lib.scanning} progress={lib.progress} />}
      {tab === 'movies' && <BrowseTab api={api} kind="movie" />}
      {tab === 'series' && <BrowseTab api={api} kind="series" />}
      {tab === 'list' && <ListTab api={api} />}
      {tab === 'more' && (
        <MoreTab
          sources={props.sources}
          prefs={prefs}
          setPrefs={setPrefs}
          libraryCount={lib.items.length}
          updatedAt={lib.updatedAt}
          scanning={lib.scanning}
          progress={lib.progress}
          onRefresh={lib.refresh}
          onAddSource={props.onAddSource}
          onRemoveSource={props.onRemoveSource}
          onSyncSource={props.onSyncSource}
          onClearHistory={props.onClearHistory}
        />
      )}

      {!lib.ready && tab !== 'more' && (
        <div className="fixed inset-x-0 top-20 z-10 flex justify-center">
          <span className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-[12px] text-zinc-300 backdrop-blur">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading library… {lib.progress}
          </span>
        </div>
      )}

      {searchOpen && <SearchOverlay api={api} onClose={() => setSearchOpen(false)} />}

      {props.selected && (
        <div className="fixed inset-0 z-[200] overflow-y-auto bg-[#07080C]">
          <MediaDetailView
            item={props.selected.item}
            enrichedMeta={props.selected.meta}
            onBack={() => props.setSelected(null)}
            onPlayItem={props.onDetailPlay}
            isSaved={props.watchlistSet.has(props.selected.item.id)}
            onToggleWatchlist={props.onToggleWatchlist}
          />
        </div>
      )}

      {props.busy && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/50">
          <Loader2 className="h-9 w-9 animate-spin text-amber-400" />
        </div>
      )}

      {!props.playerOpen && <BottomNav tab={tab} onChange={changeTab} />}
    </div>
  );
};
