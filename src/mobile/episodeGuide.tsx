import React, { useEffect, useState } from 'react';
import { NativePlayer } from './nativePlayer';
import { normalizeLookupTitle } from '../utils/titleClean';

/** Real episode names + stills (TVMaze) and, when missing, a frame grabbed from the video itself. */

export interface GuideEpisode {
  name: string;
  image?: string;
}
type Guide = Record<string, GuideEpisode>; // "S1E3"
const LS = 'cineftp_guide_v1';
const mem = new Map<string, Guide | null>();
const pending = new Map<string, Promise<Guide | null>>();

function keyOf(title: string) {
  return normalizeLookupTitle(title).title.toLowerCase();
}
function readAll(): Record<string, Guide> {
  try {
    return JSON.parse(localStorage.getItem(LS) || '{}');
  } catch {
    return {};
  }
}
function saveOne(k: string, g: Guide) {
  try {
    const all = readAll();
    all[k] = g;
    const keys = Object.keys(all);
    if (keys.length > 40) delete all[keys[0]];
    localStorage.setItem(LS, JSON.stringify(all));
  } catch {
    /* storage full */
  }
}

export function peekGuide(series: string): Guide | null {
  const k = keyOf(series);
  if (mem.has(k)) return mem.get(k) || null;
  const g = readAll()[k] || null;
  if (g) mem.set(k, g);
  return g;
}

export function loadGuide(series: string): Promise<Guide | null> {
  if (!series.trim()) return Promise.resolve(null);
  const k = keyOf(series);
  const have = peekGuide(series);
  if (have) return Promise.resolve(have);
  if (pending.has(k)) return pending.get(k)!;
  const p = (async () => {
    try {
      const r = await fetch(
        `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(normalizeLookupTitle(series).title)}&embed=episodes`
      );
      if (!r.ok) return null;
      const j = await r.json();
      const eps: any[] = j?._embedded?.episodes || [];
      const g: Guide = {};
      for (const e of eps) {
        if (e.season == null || e.number == null) continue;
        g[`S${e.season}E${e.number}`] = {
          name: String(e.name || ''),
          image: e.image?.medium || e.image?.original || undefined,
        };
      }
      if (Object.keys(g).length === 0) return null;
      mem.set(k, g);
      saveOne(k, g);
      return g;
    } catch {
      return null;
    } finally {
      pending.delete(k);
    }
  })();
  pending.set(k, p);
  return p;
}

export function episodeName(g: Guide | null | undefined, season: number, ep: number): string | undefined {
  const n = g?.[`S${season}E${ep}`]?.name;
  return n && n.trim() ? n.trim() : undefined;
}

/** "S01E03 · Name" for the player title. */
export function playerEpisodeTitle(series: string, season: number | undefined, ep: number | undefined, fallback: string) {
  if (!ep) return fallback;
  const s = season ?? 1;
  const tag = `S${String(s).padStart(2, '0')}E${String(ep).padStart(2, '0')}`;
  const nm = episodeName(peekGuide(series), s, ep);
  return `${normalizeLookupTitle(series).title} · ${tag}${nm ? ' · ' + nm : ''}`;
}

export function useGuide(series: string): Guide | null {
  const [g, setG] = useState<Guide | null>(() => peekGuide(series));
  useEffect(() => {
    let alive = true;
    loadGuide(series).then((x) => alive && x && setG(x));
    return () => {
      alive = false;
    };
  }, [series]);
  return g;
}

/* ---- video frame thumbnails (cached in IndexedDB, 2 grabs at a time) ---- */
const DB = 'cineftp_thumbs';
function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('t');
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
async function dbGet(key: string): Promise<string | undefined> {
  try {
    const db = await openDb();
    return await new Promise((res) => {
      const r = db.transaction('t').objectStore('t').get(key);
      r.onsuccess = () => res(r.result as string | undefined);
      r.onerror = () => res(undefined);
    });
  } catch {
    return undefined;
  }
}
async function dbSet(key: string, val: string) {
  try {
    const db = await openDb();
    db.transaction('t', 'readwrite').objectStore('t').put(val, key);
  } catch {
    /* ignore */
  }
}

let running = 0;
const waiting: (() => void)[] = [];
const failed = new Set<string>();
function slot(): Promise<void> {
  if (running < 2) {
    running++;
    return Promise.resolve();
  }
  return new Promise((r) => waiting.push(() => { running++; r(); }));
}
function release() {
  running--;
  waiting.shift()?.();
}

export async function videoThumb(url: string): Promise<string | undefined> {
  const cached = await dbGet(url);
  if (cached) return cached;
  if (failed.has(url)) return undefined;
  await slot();
  try {
    const c2 = await dbGet(url);
    if (c2) return c2;
    const { data } = await NativePlayer.frame({ url });
    if (data) {
      dbSet(url, data);
      return data;
    }
  } catch {
    failed.add(url);
  } finally {
    release();
  }
  return undefined;
}

/** Thumbnail for one episode: its own still → frame from the video → the series artwork. */
export const EpisodeThumb: React.FC<{ videoUrl: string; still?: string; fallback?: string; className?: string }> = ({
  videoUrl,
  still,
  fallback,
  className,
}) => {
  const [src, setSrc] = useState<string | undefined>(still || undefined);
  useEffect(() => {
    let alive = true;
    setSrc(still || undefined);
    // a real frame of THIS file is preferred when no episode still exists
    if (!still) {
      let target: string;
      try {
        target = new URL(videoUrl).href;
      } catch {
        target = encodeURI(videoUrl);
      }
      videoThumb(target).then((d) => alive && d && setSrc(d));
    }
    return () => {
      alive = false;
    };
  }, [videoUrl, still]);
  return <img src={src || fallback} alt="" loading="lazy" className={className} />;
};
