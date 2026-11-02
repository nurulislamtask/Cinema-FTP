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
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const key = sources.map((s) => `${s.id}|${s.url}|${s.type}`).join('\n');

  const scan = useCallback(async (force: boolean) => {
    const myRun = ++run.current;
    const alive = () => run.current === myRun;
    const list = sourcesRef.current;
    const sig = list.map((s) => `${s.id}|${s.url}|${s.type}`).join('\n');
    setScanning(true);

    const combined: ParsedFtpItem[] = [];
    const seen = new Set<string>();
    let timer: number | null = null;
    const flush = () => {
      timer = null;
      if (alive()) {
        setItems(dedupeTitle([...combined]));
        setReady(true);
      }
    };
    const schedule = () => {
      if (timer === null) timer = window.setTimeout(flush, 1200);
    };

    let done = 0;
    await Promise.all(
      list.map(async (src) => {
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
                combined.push({
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
        } catch {
          /* one server being offline must not stop the others */
        } finally {
          done++;
          if (alive()) setProgress(`${done}/${list.length} servers`);
        }
      })
    );

    if (timer !== null) window.clearTimeout(timer);
    if (!alive()) return;
    const finalItems = dedupeTitle(combined);
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
