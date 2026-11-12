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

const NOISE =
  /\b(480p|576p|720p|1080p|2160p|4k|uhd|hdr|blu-?ray|brrip|bdrip|web-?rip|web-?dl|hdrip|dvdrip|hdcam|camrip|x264|x265|hevc|h264|h265|10bit|dual audio|dual|multi|hindi|bangla|bengali|english|dubbed|esubs?|subbed|extended|uncut|unrated|remastered|proper|repack|complete)\b/g;

/** Same film written differently ("The Batman (2022)", "the.batman.2022.1080p") gets the same key. */
export function titleKey(item: ParsedFtpItem): string {
  return (item.cleanTitle || item.rawName || '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(NOISE, ' ')
    .replace(/[^a-z0-9\u0980-\u09ff\u0900-\u097f]+/g, '')
    .replace(/^the(?=.{3,})/, '');
}

export function dedupeTitle(items: ParsedFtpItem[]): ParsedFtpItem[] {
  const index = new Map<string, { at: number; year: number }[]>();
  const out: ParsedFtpItem[] = [];
  for (const item of items) {
    // Only whole titles are merged; episodes / files / subtitles / folders are left alone
    const isSeries = item.mediaKind === 'series';
    if (item.mediaKind !== 'movie' && !isSeries) {
      out.push(item);
      continue;
    }
    const norm = titleKey(item);
    if (norm.length < 2) {
      out.push(item);
      continue;
    }
    const key = `${isSeries ? 'tv' : 'mv'}|${norm}`;
    const year = item.year || 0;
    const list = index.get(key) || [];
    // a movie with an unknown year is the same film as the one with a year; two different known years are different films
    const hit = isSeries ? list[0] : list.find((e) => e.year === year || e.year === 0 || year === 0);
    if (!hit) {
      list.push({ at: out.length, year });
      index.set(key, list);
      out.push(item);
    } else {
      const cur = out[hit.at];
      const better = qualityRank(item) > qualityRank(cur) ? item : cur;
      const y = cur.year || item.year;
      out[hit.at] = better.year === y ? better : { ...better, year: y }; // keep the best quality at the original position
      if (hit.year === 0 && y) hit.year = y;
    }
  }
  return out;
}
