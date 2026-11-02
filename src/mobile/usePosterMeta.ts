import { useEffect, useState } from 'react';
import { ParsedFtpItem } from '../utils/ftpParser';
import { EnrichedMetadata, fetchItemMetadata, peekItemMetadata } from '../services/ftpClient';

/** Poster / backdrop / plot for an item: instant from the saved cache, otherwise looked up (and retried) once `enabled`. */
export function usePosterMeta(item: ParsedFtpItem, enabled = true): EnrichedMetadata | null {
  const [meta, setMeta] = useState<EnrichedMetadata | null>(() => peekItemMetadata(item));
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setMeta(peekItemMetadata(item));
    setRetry(0);
  }, [item.id]);

  useEffect(() => {
    if (!enabled || meta?.found) return;
    let cancelled = false;
    let timer: number | undefined;
    fetchItemMetadata(item).then((res) => {
      if (cancelled) return;
      if (res?.found) setMeta(res);
      else if (retry < 3) timer = window.setTimeout(() => !cancelled && setRetry((r) => r + 1), 5000 + retry * 5000);
    });
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, item.id, retry, meta?.found]);

  return meta;
}
