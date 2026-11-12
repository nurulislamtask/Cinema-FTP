import { useCallback, useEffect, useRef, useState } from 'react';
import { AppSource } from '../types/cineftp';
import { ParsedFtpItem } from '../utils/ftpParser';
import { browseDirectoryWithDeepScan } from '../services/ftpClient';
import { dedupeTitle } from '../utils/dedupe';
import { readCatalog, writeCatalog } from './catalogCache';

const FRESH_MS = 6 * 60 * 60 * 1000; // a saved library younger than this is used as it is

/** The whole library (all sources) kept in memory + IndexedDB. Opens instantly, refreshes quietly in the background. */
export function useLibrary(sources: AppSource[]) {
  const [items, setItems] = useState<ParsedFtpItem[]>([]);
  const [ready, setReady] = useState(false); // first paint possible (cache read or first results)
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState('');
  const [updatedAt, setUpdatedAt] = useState(0);
  const run = useRef(0);
  const itemsRef = useRef<ParsedFtpItem[]>([]);
  itemsRef.current = items;
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const key = sources.map((s) => `${s.id}|${s.url}|${s.type}`).join('\n');

  const scan = useCallback(async (force: boolean) => {
    const myRun = ++run.current;
    const alive = () => run.current === myRun;
    const list = sourcesRef.current;
    const sig = list.map((s) => `${s.id}|${s.url}|${s.type}`).join('\n');
    setScanning(true);

    // What we knew before stays until a server has answered completely: a slow / offline / half-read server
    // must never make titles disappear (they used to vanish and come back on the next scan).
    const prev = itemsRef.current;
    const fresh = new Map<string, ParsedFtpItem[]>();
    const status = new Map<string, 'run' | 'ok' | 'fail'>();
    list.forEach((s) => {
      fresh.set(s.id, []);
      status.set(s.id, 'run');
    });
    const compose = (): ParsedFtpItem[] => {
      const out: ParsedFtpItem[] = [];
      const ids = new Set<string>();
      for (const src of list) {
        const f = fresh.get(src.id) || [];
        const old = prev.filter((p) => p.sourceServerUrl === src.url);
        let use: ParsedFtpItem[];
        if (status.get(src.id) === 'ok' && (old.length === 0 || f.length >= old.length * (force ? 0.6 : 0.85))) {
          use = f; // complete answer: it replaces the old list (removed titles disappear)
        } else {
          const m = new Map(old.map((o) => [o.id, o] as const)); // still running / failed / looks incomplete: keep + add
          f.forEach((x) => m.set(x.id, x));
          use = [...m.values()];
        }
        for (const it of use) {
          if (ids.has(it.id)) continue;
          ids.add(it.id);
          out.push(it);
        }
      }
      return dedupeTitle(out);
    };

    let timer: number | null = null;
    const flush = () => {
      timer = null;
      if (alive()) {
        setItems(compose());
        setReady(true);
      }
    };
    const schedule = () => {
      if (timer === null) timer = window.setTimeout(flush, 1200);
    };

    let done = 0;
    await Promise.all(
      list.map(async (src) => {
        const seen = new Set<string>();
        try {
          await browseDirectoryWithDeepScan(
            src.url,
            (count, name) => alive() && setProgress(`${src.name} · ${name} (${count})`),
            (chunk) => {
              let added = false;
              for (const it of chunk) {
                if (seen.has(it.id)) continue;
                if (it.mediaKind !== 'movie' && it.mediaKind !== 'series' && it.mediaKind !== 'generic_folder') continue;
                seen.add(it.id);
                fresh.get(src.id)!.push({
                  ...it,
                  mediaKind: it.mediaKind === 'generic_folder' ? (src.type === 'series' ? 'series' : 'movie') : it.mediaKind,
                  sourceServerName: src.name,
                  sourceServerUrl: src.url,
                });
                added = true;
              }
              if (added) schedule();
            },
            force
          );
          status.set(src.id, 'ok');
        } catch {
          status.set(src.id, 'fail'); // one server being offline must not stop the others, nor erase its titles
        } finally {
          done++;
          if (alive()) setProgress(`${done}/${list.length} servers`);
        }
      })
    );

    if (timer !== null) window.clearTimeout(timer);
    if (!alive()) return;
    const finalItems = compose();
    if (finalItems.length > 0) {
      setItems(finalItems);
      const ts = Date.now();
      setUpdatedAt(ts);
      writeCatalog({ ts, key: sig, items: finalItems });
    }
    setReady(true);
    setScanning(false);
    setProgress('');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await readCatalog();
      if (cancelled) return;
      if (cached && cached.items.length > 0) {
        setItems(cached.items);
        setUpdatedAt(cached.ts);
        setReady(true);
        if (cached.key === key && Date.now() - cached.ts < FRESH_MS) return; // fresh enough: no scan at all
      }
      scan(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [key, scan]);

  return { items, ready, scanning, progress, updatedAt, refresh: () => scan(true) };
}
