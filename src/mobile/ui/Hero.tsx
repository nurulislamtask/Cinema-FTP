import React, { useEffect, useRef, useState } from 'react';
import { Play, Info, Plus, Check, Star } from 'lucide-react';
import { ParsedFtpItem } from '../../utils/ftpParser';
import { displayTitle } from '../../utils/titleClean';
import { EnrichedMetadata } from '../../services/ftpClient';
import { usePosterMeta } from '../usePosterMeta';

interface SlideProps {
  item: ParsedFtpItem;
  active: boolean;
  saved: boolean;
  onPlay: (item: ParsedFtpItem, meta: EnrichedMetadata | null) => void;
  onDetails: (item: ParsedFtpItem, meta: EnrichedMetadata | null) => void;
  onToggleSave: (item: ParsedFtpItem) => void;
}

const Slide: React.FC<SlideProps> = ({ item, active, saved, onPlay, onDetails, onToggleSave }) => {
  const meta = usePosterMeta(item, true);
  const [broken, setBroken] = useState(false);
  const poster = !broken ? meta?.posterUrl || item.posterUrl : undefined;
  const title = displayTitle(item.cleanTitle || item.rawName);
  const year = meta?.year || item.year;
  const plot = meta?.plot || item.plot;
  const rating = meta?.imdbRating || item.imdbRating;
  const genres = (meta?.genres || item.genres || []).slice(0, 3);

  return (
    <div
      className={`absolute inset-0 transition-opacity duration-700 ${active ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      aria-hidden={!active}
    >
      {poster ? (
        <img
          src={poster}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover object-top"
        />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-[#2A1F08] via-[#14161F] to-[#07080C]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#07080C] via-[#07080C]/55 to-black/30" />
      <div className="absolute inset-x-0 bottom-0 px-4 pb-9 md:px-10 md:pb-12">
        <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-zinc-300">
          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-amber-300 ring-1 ring-amber-400/30">
            {item.mediaKind === 'series' ? 'SERIES' : 'MOVIE'}
          </span>
          {rating && (
            <span className="flex items-center gap-1 text-amber-300">
              <Star className="h-3 w-3 fill-amber-300" />
              {rating}
            </span>
          )}
          {year && <span>{year}</span>}
          {item.quality && <span className="rounded border border-white/25 px-1.5 text-[10px]">{item.quality}</span>}
        </div>
        <h1 className="line-clamp-2 text-[28px] md:text-[44px] font-extrabold leading-[1.05] tracking-tight text-white drop-shadow-lg">{title}</h1>
        {genres.length > 0 && <p className="mt-1 text-[12px] text-zinc-300">{genres.join(' · ')}</p>}
        {plot && <p className="mt-2 line-clamp-2 md:max-w-2xl text-[12.5px] md:text-sm leading-snug text-zinc-300/90">{plot}</p>}
        <div className="mt-4 flex items-center gap-2.5 md:max-w-md">
          <button
            onClick={() => onPlay(item, meta)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-400 py-3 text-[15px] font-bold text-black shadow-lg shadow-amber-500/20 active:scale-[0.97]"
          >
            <Play className="h-5 w-5 fill-black" /> Play
          </button>
          <button
            onClick={() => onDetails(item, meta)}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-white/15 px-4 py-3 text-[14px] font-semibold text-white backdrop-blur active:scale-[0.97]"
          >
            <Info className="h-5 w-5" /> Info
          </button>
          <button
            aria-label="My List"
            onClick={() => onToggleSave(item)}
            className="rounded-xl bg-white/15 p-3 text-white backdrop-blur active:scale-[0.97]"
          >
            {saved ? <Check className="h-5 w-5 text-amber-300" /> : <Plus className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Full-width slideshow of today's trending titles. Slides itself, swipe to change, pauses while touched. */
export const Hero: React.FC<{
  items: ParsedFtpItem[];
  auto: boolean;
  isSaved: (id: string) => boolean;
  onPlay: SlideProps['onPlay'];
  onDetails: SlideProps['onDetails'];
  onToggleSave: SlideProps['onToggleSave'];
}> = ({ items, auto, isSaved, onPlay, onDetails, onToggleSave }) => {
  const [index, setIndex] = useState(0);
  const paused = useRef(false);
  const touchX = useRef<number | null>(null);
  const n = items.length;

  useEffect(() => {
    if (!auto || n < 2) return;
    const t = window.setInterval(() => {
      if (!paused.current) setIndex((i) => (i + 1) % n);
    }, 5500);
    return () => window.clearInterval(t);
  }, [auto, n]);

  useEffect(() => setIndex(0), [items[0]?.id]);

  if (n === 0) {
    return <div className="h-[62vh] md:h-[58vh] md:max-h-[540px] animate-pulse bg-gradient-to-b from-[#161A25] to-[#07080C]" />;
  }

  return (
    <div
      className="relative h-[66vh] min-h-[420px] w-full overflow-hidden md:h-[58vh] md:max-h-[540px] md:min-h-[380px]"
      onTouchStart={(e) => {
        paused.current = true;
        touchX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        window.setTimeout(() => (paused.current = false), 4000);
        if (start === null) return;
        const dx = e.changedTouches[0].clientX - start;
        if (Math.abs(dx) > 45) setIndex((i) => (dx < 0 ? (i + 1) % n : (i - 1 + n) % n));
      }}
    >
      {items.map((it, i) => (
        <Slide
          key={it.id}
          item={it}
          active={i === index}
          saved={isSaved(it.id)}
          onPlay={onPlay}
          onDetails={onDetails}
          onToggleSave={onToggleSave}
        />
      ))}
      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
        {items.map((_, i) => (
          <button
            key={i}
            aria-label={`Slide ${i + 1}`}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-amber-400' : 'w-1.5 bg-white/35'}`}
          />
        ))}
      </div>
    </div>
  );
};
