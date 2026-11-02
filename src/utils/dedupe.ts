import { ParsedFtpItem } from './ftpParser';

// ---- Duplicate titles (same movie/series found in several sources or quality folders) ----
export function qualityRank(item: ParsedFtpItem): number {
  const t = `${item.quality || ''} ${item.rawName || ''} ${item.url || ''}`.toLowerCase();
  if (/2160p|\b4k\b|uhd/.test(t)) return 4;
  if (/1080p/.test(t)) return 3;
  if (/720p/.test(t)) return 2;
  if (/480p|360p|dvdrip|hdcam|cam\b/.test(t)) return 1;
  return 0;
}

export function dedupeTitle(items: ParsedFtpItem[]): ParsedFtpItem[] {
  const index = new Map<string, number>();
  const out: ParsedFtpItem[] = [];
  for (const item of items) {
    // Only whole titles are merged; episodes / files / subtitles / folders are left alone
    const isSeries = item.mediaKind === 'series';
    if (item.mediaKind !== 'movie' && !isSeries) {
      out.push(item);
      continue;
    }
    const norm = (item.cleanTitle || item.rawName || '')
      .toLowerCase()
      .replace(/\(.*?\)|\[.*?\]/g, ' ')
      .replace(/[^a-z0-9\u0980-\u09ff\u0900-\u097f]+/g, '');
    if (norm.length < 2) {
      out.push(item);
      continue;
    }
    const key = `${isSeries ? 'tv' : 'mv'}|${norm}|${isSeries ? '' : item.year || ''}`;
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, out.length);
      out.push(item);
    } else if (qualityRank(item) > qualityRank(out[at])) {
      out[at] = item; // keep the best quality at the original position
    }
  }
  return out;
}

