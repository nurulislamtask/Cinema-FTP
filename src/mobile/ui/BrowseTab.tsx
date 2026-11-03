import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { ParsedFtpItem } from '../../utils/ftpParser';
import { displayTitle } from '../../utils/titleClean';
import { MobilePoster } from './MobilePoster';
import { ShellApi } from './types';

type Sort = 'latest' | 'az';

/** Movies / Series: filter by source (language / category), sort, and an endless grid. */
export const BrowseTab: React.FC<{ api: ShellApi; kind: 'movie' | 'series' }> = ({ api, kind }) => {
  const [source, setSource] = useState('all');
  const [sort, setSort] = useState<Sort>('latest');
  const [shown, setShown] = useState(60);
  const sentinel = useRef<HTMLDivElement>(null);

  const all = useMemo(() => api.library.filter((i) => i.mediaKind === kind), [api.library, kind]);
  const sourceNames = useMemo(() => {
    const m = new Map<string, number>();
    all.forEach((i) => m.set(i.sourceServerName || '', (m.get(i.sourceServerName || '') || 0) + 1));
    return [...m.entries()].filter(([n]) => n).sort((a, b) => b[1] - a[1]);
  }, [all]);

  const list = useMemo(() => {
    let l = source === 'all' ? all : all.filter((i) => i.sourceServerName === source);
    l = [...l];
    if (sort === 'az') l.sort((a, b) => displayTitle(a.cleanTitle).localeCompare(displayTitle(b.cleanTitle)));
    else l.sort((a, b) => (b.year || 0) - (a.year || 0));
    return l;
  }, [all, source, sort]);

  useEffect(() => setShown(60), [source, sort, kind]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setShown((n) => n + 60), { rootMargin: '900px' });
    io.observe(node);
    return () => io.disconnect();
  }, [list.length]);

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
      active ? 'bg-amber-400 text-black' : 'bg-white/[0.07] text-zinc-300 active:bg-white/15'
    }`;

  return (
    <div className="pb-4">
      <div className="sticky top-0 z-20 bg-[#07080C]/95 pb-2 pt-3 backdrop-blur">
        <div className="flex items-center justify-between px-4 md:px-6">
          <div>
            <h1 className="text-[22px] font-extrabold tracking-tight text-white">{kind === 'movie' ? 'Movies' : 'Series'}</h1>
            <p className="text-[11px] text-zinc-500">{list.length.toLocaleString()} titles</p>
          </div>
          <button onClick={api.openSearch} aria-label="Search" className="rounded-full bg-white/[0.07] p-2.5 active:scale-90">
            <Search className="h-5 w-5 text-white" />
          </button>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto px-4 md:px-6" style={{ scrollbarWidth: 'none' }}>
          <button className={chip(sort === 'latest')} onClick={() => setSort('latest')}>Latest</button>
          <button className={chip(sort === 'az')} onClick={() => setSort('az')}>A–Z</button>
          <span className="mx-1 w-px shrink-0 bg-white/10" />
          <button className={chip(source === 'all')} onClick={() => setSource('all')}>All</button>
          {sourceNames.map(([n]) => (
            <button key={n} className={chip(source === n)} onClick={() => setSource(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9 gap-x-2.5 md:gap-x-3 gap-y-4 px-3.5 md:px-6 pt-2">
        {list.slice(0, shown).map((it: ParsedFtpItem) => (
          <MobilePoster
            key={it.id}
            item={it}
            onOpen={api.openDetails}
            saved={api.isSaved(it.id)}
            onToggleSave={api.toggleSave}
          />
        ))}
      </div>
      {shown < list.length && <div ref={sentinel} className="h-16" />}
      {list.length === 0 && <p className="px-6 pt-16 text-center text-sm text-zinc-500">Nothing here yet.</p>}
    </div>
  );
};
