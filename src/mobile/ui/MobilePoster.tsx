import React, { memo, useEffect, useRef, useState } from 'react';
import { Bookmark, BookmarkCheck, Tv, Film } from 'lucide-react';
import { ParsedFtpItem } from '../../utils/ftpParser';
import { displayTitle } from '../../utils/titleClean';
import { EnrichedMetadata } from '../../services/ftpClient';
import { usePosterMeta } from '../usePosterMeta';

interface Props {
  item: ParsedFtpItem;
  onOpen: (item: ParsedFtpItem, meta: EnrichedMetadata | null) => void;
  saved?: boolean;
  onToggleSave?: (item: ParsedFtpItem) => void;
  className?: string;
}

function smallPoster(u?: string) {
  return u ? u.replace(/_V1_SX600\.jpg$/i, '_V1_SX340.jpg').replace('600x900bb', '340x510bb') : undefined;
}

/** Poster card: starts looking for its picture a few screens before it scrolls into view. */
export const MobilePoster: React.FC<Props> = memo(({ item, onOpen, saved, onToggleSave, className = '' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [broken, setBroken] = useState(false);
  const meta = usePosterMeta(item, near);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!('IntersectionObserver' in window)) return setNear(true);
    const io = new IntersectionObserver(
      (e) => {
        if (e[0].isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '1200px 600px' }
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  useEffect(() => setBroken(false), [meta?.posterUrl]);

  const title = displayTitle(item.cleanTitle || item.rawName);
  const poster = broken ? undefined : smallPoster(meta?.posterUrl || item.posterUrl);
  const isSeries = item.mediaKind === 'series';
  const year = meta?.year || item.year;
  const dual = /dual|multi/i.test(`${item.audioTag || ''} ${item.rawName}`);

  return (
    <div ref={ref} className={`relative select-none ${className}`}>
      <button
        onClick={() => onOpen(item, meta)}
        className="block w-full text-left active:scale-[0.97] transition-transform duration-150"
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-[#12151D] ring-1 ring-white/[0.06]">
          {poster ? (
            <img
              src={poster}
              alt=""
              referrerPolicy="no-referrer"
              decoding="async"
              onError={() => setBroken(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col justify-between bg-gradient-to-b from-[#1B2132] to-[#0C0E15] p-2.5">
              {isSeries ? <Tv className="h-4 w-4 text-amber-400" /> : <Film className="h-4 w-4 text-zinc-400" />}
              <p className="line-clamp-4 text-[13px] font-bold leading-tight text-zinc-100">{title}</p>
              <span className="text-[10px] font-mono text-zinc-500">{year || ''}</span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute left-1.5 top-1.5 flex flex-col gap-1">
            {dual && (
              <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wide text-black">
                Dual
              </span>
            )}
          </div>
          {isSeries && (
            <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-300 backdrop-blur">
              SERIES
            </span>
          )}
        </div>
        <p className="mt-1.5 truncate text-[12.5px] font-medium text-zinc-100">{title}</p>
        <p className="truncate text-[11px] text-zinc-500">
          {year || ''}
          {year && (item.quality || '') ? ' · ' : ''}
          {item.quality || ''}
        </p>
      </button>
      {onToggleSave && (
        <button
          aria-label="My List"
          onClick={() => onToggleSave(item)}
          className="absolute right-1.5 top-1.5 rounded-full bg-black/55 p-1.5 backdrop-blur active:scale-90"
        >
          {saved ? <BookmarkCheck className="h-3.5 w-3.5 text-amber-400" /> : <Bookmark className="h-3.5 w-3.5 text-zinc-200" />}
        </button>
      )}
    </div>
  );
});
