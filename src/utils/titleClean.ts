/**
 * Folder names look like "Lanterns (TV Series 2026– ) 1080p [Dual Audio]". Poster sites only know "Lanterns".
 * Returns the bare title (and a year if the name contained one) to use for poster / info lookups and for display.
 */
const JUNK =
  /\b(\d\.\d(?=\s|$)|2160p|1080p|720p|576p|480p|360p|4k|uhd|hdr10?\+?|dolby|vision|bluray|blu-?ray|brrip|bdrip|web-?dl|web-?rip|webrip|hdrip|hdtv|dvdrip|dvdscr|hdcam|hdts|camrip|cam|x ?264|x ?265|h ?\.?264|h ?\.?265|hevc|10bit|aac|ac3|eac3|dts|ddp?\d?(\.\d)?|atmos|dual[\s-]?audio|multi[\s-]?audio|dubbed|esubs?|subs?|complete|tv[\s-]?series|web[\s-]?series|tv[\s-]?show|series|seasons?\s*\d+(\s*[-&]\s*\d+)?|s\d{1,2}(\s*[-&]\s*s?\d{1,2})?(e\d{1,3})?|ep(isodes?)?\s*\d*)\b/gi;

export function normalizeLookupTitle(raw: string, year?: number): { title: string; year?: number } {
  const original = (raw || '').trim();
  const yearInName = original.match(/\b((?:19|20)\d{2})\b/);
  let t = original
    .replace(/[\(\[\{][^)\]\}]*[\)\]\}]?/g, ' ') // bracket groups, also unfinished ones
    .replace(/\b(?:19|20)\d{2}\s*[–—-]\s*(?:(?:19|20)\d{2})?/g, ' ') // 2026–  /  2019-2022
    .replace(JUNK, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/(?:\s+(?:hindi|english|bangla|bengali|tamil|telugu|malayalam|kannada|korean|chinese|japanese|urdu|punjabi|multi|dual))+\s*$/i, '')
    .replace(/\s*[-–—:|\u00b7]+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // a name that is only a year ("1883") must stay as it is
  if (t.length < 2) t = original.replace(/[\(\[\{].*$/, '').replace(/[._]+/g, ' ').trim() || original;
  return { title: t, year: year || (yearInName ? parseInt(yearInName[1], 10) : undefined) };
}

export function displayTitle(raw: string): string {
  return normalizeLookupTitle(raw).title;
}
