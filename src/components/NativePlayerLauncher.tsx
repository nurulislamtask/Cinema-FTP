import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ParsedFtpItem } from '../utils/ftpParser';
import type { CinemaPlayerProps } from './CinemaPlayer';
import { NativePlayer, NativePlayerItem } from '../mobile/nativePlayer';
import { displayTitle } from '../utils/titleClean';
import { registerBack } from '../mobile/backStack';
import { playerEpisodeTitle } from '../mobile/episodeGuide';
import { readPrefs } from '../mobile/prefs';
import { resolvePlayableFromFolder, getCachedPlayableUrl, saveCachedPlayableUrl } from '../services/ftpClient';

const DIRECT_VIDEO = /\.(mp4|mkv|webm|avi|mov|ts|m4v|m2ts|wmv|flv)(\?.*)?$/i;
const POS_KEY = 'cineftp_resume_v1';

// Names with spaces / brackets / non-English letters must be percent-encoded for the native player (the web view was forgiving)
function safeUrl(u: string): string {
  try {
    return new URL(u).href;
  } catch {
    return encodeURI(u);
  }
}

function readPositions(): Record<string, { t: number; d: number }> {
  try {
    return JSON.parse(localStorage.getItem(POS_KEY) || '{}');
  } catch {
    return {};
  }
}
function savePosition(id: string, t: number, d: number) {
  try {
    const all = readPositions();
    if (d > 0 && t > d - 60) delete all[id]; // finished: next time start from the beginning
    else if (t > 10) all[id] = { t, d };
    const keys = Object.keys(all);
    if (keys.length > 600) keys.slice(0, keys.length - 600).forEach((k) => delete all[k]);
    localStorage.setItem(POS_KEY, JSON.stringify(all));
  } catch {}
}

function titleOf(p: ParsedFtpItem): string {
  const base = p.cleanTitle || p.rawName;
  if (p.episode === undefined) return base;
  return playerEpisodeTitle(base.split(' · ')[0], p.season, p.episode, base);
}

function metaOf(p: ParsedFtpItem) {
  return {
    query: displayTitle(p.cleanTitle || p.rawName),
    year: p.year,
    season: p.episode !== undefined ? p.season ?? 1 : undefined,
    episode: p.episode,
  };
}

/** Opens the native phone player for the chosen video, then closes this screen when the user leaves it. */
export const NativePlayerLauncher: React.FC<CinemaPlayerProps> = (props) => {
  const { video, playlist, subtitles, initialStartTime = 0, onClose } = props;
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('Opening player…');
  const launchedFor = useRef<string | null>(null);
  useEffect(() => registerBack(() => { onClose(); return true; }), []);
  const setFallback = (_startAt: number) =>
    setFailure('This file could not be played. Try again, or use "Open with" inside the player to pick another app.');

  useEffect(() => {
    const key = video.id + '#' + attempt;
    if (launchedFor.current === key) return;
    launchedFor.current = key;
    setFailure(null);
    let alive = true;

    (async () => {
      try {
        // 1. the real file address (a card can point at a folder)
        let url = video.url;
        if (!DIRECT_VIDEO.test(url)) {
          const cached = getCachedPlayableUrl(video.id) || getCachedPlayableUrl(video.url);
          if (cached && DIRECT_VIDEO.test(cached)) url = cached;
          else {
            setStatus('Finding the video file…');
            const playable = await resolvePlayableFromFolder(video);
            const found = playable?.primaryVideo?.url;
            if (!found || !DIRECT_VIDEO.test(found)) throw new Error('no file');
            url = found;
            saveCachedPlayableUrl(video.id, found);
            saveCachedPlayableUrl(video.url, found);
          }
        }

        // 2. queue = this episode + the other episodes of the season (next / previous buttons work)
        const toSub = (list: ParsedFtpItem[]) =>
          list.slice(0, 25).map((s) => ({ url: safeUrl(s.url), label: s.cleanTitle || s.rawName }));
        const epRegex = (ep?: number) =>
          ep ? new RegExp(`(?:e|x|ep\\.?\\s*)0*${ep}(?!\\d)`, 'i') : null;

        const queue: { id: string; item: NativePlayerItem }[] = [];
        for (const p of playlist || []) {
          if (p.id === video.id) {
            queue.push({
              id: p.id,
              item: { url: safeUrl(url), title: titleOf(p), ...metaOf(p), subtitles: toSub(subtitles || []) },
            });
          } else if (!p.isDirectory && DIRECT_VIDEO.test(p.url)) {
            const re = epRegex(p.episode);
            const subs = re ? (subtitles || []).filter((s) => re.test(s.rawName)) : [];
            queue.push({ id: p.id, item: { url: safeUrl(p.url), title: titleOf(p), ...metaOf(p), subtitles: toSub(subs) } });
          }
        }
        if (!queue.some((q) => q.id === video.id)) {
          queue.splice(0, queue.length, {
            id: video.id,
            item: { url: safeUrl(url), title: titleOf(video), ...metaOf(video), subtitles: toSub(subtitles || []) },
          });
        }
        const index = Math.max(0, queue.findIndex((q) => q.id === video.id));

        const saved = readPositions()[video.id];
        const prefs = readPrefs();
        const startAt = initialStartTime > 0 ? initialStartTime : saved && prefs.resumePlayback ? saved.t : 0;

        setStatus('Starting…');
        const res = await NativePlayer.play({ items: queue.map((q) => q.item), index, position: startAt, software: prefs.softwareDecoder, autoSubs: prefs.autoSubtitles, subLang: prefs.subtitleLang });
        if (!alive) return;

        const playedId = queue[Math.min(res.index, queue.length - 1)]?.id || video.id;
        savePosition(playedId, res.position, res.duration);

        if (res.error && res.position < 5) {
          // the native player could not start this file: try the in-app web player as a last resort
          setFallback(startAt);
          return;
        }
        onClose();
      } catch {
        if (alive) setFallback(initialStartTime || 0);
      }
    })();

    return () => {
      alive = false;
    };
  }, [video.id, attempt]);

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col items-center justify-center text-zinc-300 gap-4">
      <button
        onClick={onClose}
        className="absolute top-4 left-4 p-3 rounded-full bg-white/10 text-white"
        aria-label="Back"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      {failure ? (
        <>
          <p className="px-8 text-center text-sm text-rose-300 whitespace-pre-wrap break-words">{failure}</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-white/10 text-white font-semibold">
              Back
            </button>
            <button
              onClick={() => setAttempt((a) => a + 1)}
              className="px-5 py-2.5 rounded-xl bg-[#E5A00D] text-black font-bold"
            >
              Try again
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-[#E5A00D] animate-spin" />
          <p className="text-sm">{status}</p>
        </>
      )}
    </div>
  );
};
