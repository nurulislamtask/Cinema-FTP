import React, { useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { ParsedFtpItem } from '../../utils/ftpParser';
import { MobilePoster } from './MobilePoster';
import { Hero } from './Hero';
import { Row } from './Row';
import { ShellApi } from './types';
import { MobilePrefs } from '../prefs';
import { clearResume, fmtTime, readResume } from '../resume';
import { usePosterMeta } from '../usePosterMeta';
import { displayTitle } from '../../utils/titleClean';
import { Play } from 'lucide-react';

// small seeded random so "today's picks" stay the same for a few hours and then change
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export function pickTrending(items: ParsedFtpItem[], count: number): ParsedFtpItem[] {
  const titles = items.filter((i) => i.mediaKind === 'movie' || i.mediaKind === 'series');
  const maxYear = titles.reduce((m, i) => Math.max(m, i.year || 0), 0);
  const fresh = titles.filter((i) => (i.year || 0) >= maxYear - 1 && !/wwe|wrestl|aew/i.test(i.sourceServerName || ''));
  const pool = (fresh.length >= count ? fresh : titles).slice(0, 90);
  const rand = rng(Math.floor(Date.now() / (3 * 3600 * 1000)));
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

const newest = (a: ParsedFtpItem, b: ParsedFtpItem) => (b.year || 0) - (a.year || 0);

const ContinueCard: React.FC<{ item: ParsedFtpItem; t: number; d: number; onPlay: () => void; onRemove: () => void }> = ({
  item,
  t,
  d,
  onPlay,
  onRemove,
}) => {
  const meta = usePosterMeta(item, true);
  const poster = meta?.backdropUrl || meta?.posterUrl || item.posterUrl;
  const pct = d > 0 ? Math.min(100, Math.max(3, (t / d) * 100)) : 5;
  return (
    <div className="relative w-[62vw] max-w-[280px] shrink-0 snap-start">
      <button onClick={onPlay} className="block w-full text-left active:scale-[0.97] transition-transform">
        <div className="relative aspect-video overflow-hidden rounded-xl bg-[#12151D] ring-1 ring-white/[0.06]">
          {poster ? (
            <img src={poster} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-[#1B2132] to-[#0C0E15]" />
          )}
          <div className="absolute inset-0 bg-black/35" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2.5 ring-1 ring-white/30 backdrop-blur">
            <Play className="h-5 w-5 fill-white text-white" />
          </div>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <p className="mt-1.5 truncate text-[12.5px] font-medium text-zinc-100">{displayTitle(item.cleanTitle || item.rawName)}</p>
        <p className="text-[11px] text-zinc-500">
          {fmtTime(t)}
          {d > 0 ? ` / ${fmtTime(d)}` : ''}
        </p>
      </button>
      <button
        aria-label="Remove"
        onClick={onRemove}
        className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 backdrop-blur active:scale-90"
      >
        <X className="h-3.5 w-3.5 text-zinc-200" />
      </button>
    </div>
  );
};

export const HomeTab: React.FC<{ api: ShellApi; prefs: MobilePrefs; scanning: boolean; progress: string }> = ({
  api,
  prefs,
  scanning,
  progress,
}) => {
  const { library } = api;

  const hidden = useMemo(() => {
    const ids = new Set(prefs.homeHidden);
    return new Set(api.sources.filter((s) => ids.has(s.id) || (prefs.homeHidden.length === 0 && /wwe|wrestl|aew/i.test(s.name))).map((s) => s.name));
  }, [api.sources, prefs.homeHidden]);

  const homeItems = useMemo(() => library.filter((i) => !hidden.has(i.sourceServerName || '')), [library, hidden]);
  const hero = useMemo(() => pickTrending(homeItems, 6), [homeItems.length > 0 ? homeItems[0].id : '', homeItems.length > 20]);
  const trending = useMemo(() => pickTrending(homeItems, 24).slice(0, 20), [homeItems.length > 0 ? homeItems[0].id : '', homeItems.length > 20]);
  const movies = useMemo(() => homeItems.filter((i) => i.mediaKind === 'movie').sort(newest).slice(0, 24), [homeItems]);
  const series = useMemo(() => homeItems.filter((i) => i.mediaKind === 'series').sort(newest).slice(0, 24), [homeItems]);
  const dual = useMemo(() => homeItems.filter((i) => /dual|multi/i.test(`${i.audioTag || ''} ${i.rawName}`)).sort(newest).slice(0, 20), [homeItems]);

  const sourceRows = useMemo(() => {
    const groups = new Map<string, ParsedFtpItem[]>();
    for (const it of homeItems) {
      const k = it.sourceServerName || '';
      if (!k) continue;
      (groups.get(k) || groups.set(k, []).get(k)!).push(it);
    }
    return [...groups.entries()]
      .filter(([, v]) => v.length >= 6)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 6)
      .map(([name, v]) => ({ name, items: [...v].sort(newest).slice(0, 20) }));
  }, [homeItems]);

  const [removedTick, bump] = React.useReducer((x: number) => x + 1, 0);
  const continueList = useMemo(() => {
    if (!prefs.showContinue) return [];
    const resume = readResume();
    return api.recent
      .filter((r) => resume[r.id] && resume[r.id].t > 10)
      .slice(0, 12)
      .map((r) => ({ item: r.video, ...resume[r.id] }));
  }, [api.recent, prefs.showContinue, api.resumeTick, removedTick]);

  const [, force] = React.useReducer((x: number) => x + 1, 0);
  const card = (it: ParsedFtpItem, cls = 'w-[31vw] max-w-[150px] shrink-0 snap-start') => (
    <MobilePoster
      key={it.id}
      item={it}
      className={cls}
      onOpen={api.openDetails}
      saved={api.isSaved(it.id)}
      onToggleSave={api.toggleSave}
    />
  );

  return (
    <div className="pb-4">
      <div className="relative">
        <Hero
          items={hero}
          auto={prefs.heroAutoSlide}
          isSaved={api.isSaved}
          onPlay={api.play}
          onDetails={api.openDetails}
          onToggleSave={api.toggleSave}
        />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 pb-6 pt-3">
          <span className="text-[20px] font-black tracking-tight text-white">
            Cine<span className="text-amber-400">FTP</span>
          </span>
          <button onClick={api.openSearch} aria-label="Search" className="rounded-full bg-black/40 p-2.5 backdrop-blur active:scale-90">
            <Search className="h-5 w-5 text-white" />
          </button>
        </div>
      </div>

      {scanning && (
        <p className="mx-4 mt-3 truncate rounded-lg bg-white/[0.04] px-3 py-1.5 text-[11px] text-zinc-400">
          Updating library… {progress}
        </p>
      )}

      {continueList.length > 0 && (
        <Row title="Continue Watching">
          {continueList.map((c) => (
            <ContinueCard
              key={c.item.id}
              item={c.item}
              t={c.t}
              d={c.d}
              onPlay={() => api.play(c.item, null)}
              onRemove={() => {
                clearResume(c.item.id);
                bump();
                force();
                window.dispatchEvent(new Event('cineftp:prefs'));
              }}
            />
          ))}
        </Row>
      )}

      {trending.length > 0 && <Row title="Trending Now" subtitle="Changes through the day">{trending.map((i) => card(i))}</Row>}
      {movies.length > 0 && <Row title="New Movies" onMore={() => api.goTab('movies')}>{movies.map((i) => card(i))}</Row>}
      {series.length > 0 && <Row title="New Series" onMore={() => api.goTab('series')}>{series.map((i) => card(i))}</Row>}
      {dual.length > 0 && <Row title="Dual Audio">{dual.map((i) => card(i))}</Row>}
      {sourceRows.map((r) => (
        <Row key={r.name} title={r.name}>
          {r.items.map((i) => card(i))}
        </Row>
      ))}
      {api.watchlist.length > 0 && (
        <Row title="My List" onMore={() => api.goTab('list')}>
          {api.watchlist.slice(0, 20).map((i) => card(i))}
        </Row>
      )}

      {library.length === 0 && (
        <p className="px-6 pt-10 text-center text-sm text-zinc-500">
          {scanning ? 'Loading your library for the first time…' : 'No titles yet. Add a source in Settings.'}
        </p>
      )}
    </div>
  );
};
