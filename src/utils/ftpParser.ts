export type MediaKind =
  | 'movie'
  | 'series'
  | 'episode'
  | 'year_folder'
  | 'category_folder'
  | 'generic_folder'
  | 'subtitle'
  | 'image'
  | 'audio'
  | 'other';

export interface ParsedFtpItem {
  id: string;
  rawName: string;
  cleanTitle: string;
  url: string;
  isDirectory: boolean;
  sizeBytes?: number;
  sizeFormatted: string;
  lastModified: string;
  mediaKind: MediaKind;
  year?: number;
  quality?: string;
  audioTag?: string;
  codecTag?: string;
  season?: number;
  episode?: number;
  extension?: string;
  rankNumber?: number;
  posterUrl?: string;
  backdropUrl?: string;
  imdbRating?: string;
  imdbId?: string;
  genres?: string[];
  cast?: string;
  plot?: string;
  runtime?: string;
  sourceServerName?: string;
  sourceServerUrl?: string;
}

export function extractSeasonNumber(rawName: string): number | undefined {
  let decoded = rawName;
  try {
    decoded = decodeURIComponent(rawName);
  } catch {}
  decoded = decoded.replace(/\/+$/, '').trim();

  const wordsToNum: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };

  const wordMatch = decoded.match(/\b(?:Season|Series|Part|Vol(?:ume)?)\s+([a-z]+)\b/i);
  if (wordMatch && wordsToNum[wordMatch[1].toLowerCase()]) {
    return wordsToNum[wordMatch[1].toLowerCase()];
  }

  const m =
    decoded.match(/\b(?:Season|Series|Part|Vol(?:ume)?)[\s\.\-_]*(\d{1,2})\b/i) ||
    decoded.match(/^S(\d{1,2})\b/i) ||
    decoded.match(/\bS(\d{1,2})(?:\b|[\s\.\-_]|E\d)/i) ||
    decoded.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\.\-_]+(?:Season|Series)\b/i) ||
    decoded.match(/\b(\d{1,2})x\d{1,3}\b/);
  if (m) {
    const num = parseInt(m[1], 10);
    if (!isNaN(num) && num >= 0 && num <= 60) return num;
  }
  return undefined;
}

export function isSeasonFolderName(rawName: string): boolean {
  let decoded = rawName;
  try {
    decoded = decodeURIComponent(rawName);
  } catch {}
  decoded = decoded.replace(/\/+$/, '').trim();
  return (
    extractSeasonNumber(decoded) !== undefined ||
    /\b(?:Season|Series|Part)[\s\.\-_]*\d{1,2}\b/i.test(decoded) ||
    /^S\d{1,2}\b/i.test(decoded) ||
    /\bS\d{1,2}[\s\.\-_]+(1080p|720p|480p|2160p|Complete|English|Hindi|Dual)/i.test(decoded)
  );
}

export interface DirectoryBrowseResult {
  url: string;
  resolvedGatewayUrl?: string;
  serverName: string;
  pageTitle: string;
  isH5ai: boolean;
  isPortalRoot: boolean;
  parentUrl: string | null;
  breadcrumbs: { label: string; url: string }[];
  items: ParsedFtpItem[];
  localPosterUrl?: string;
  subtitles: ParsedFtpItem[];
  fetchedVia: 'backend' | 'bdix-cloud-gateway' | 'local-bridge' | 'browser-direct' | 'imported-html';
}

const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mkv', 'webm', 'avi', 'm4v', 'mov', 'ts', 'm2ts', 'flv', 'wmv', 'mpg', 'mpeg', 'ogv', '3gp'
]);

const SUBTITLE_EXTENSIONS = new Set(['srt', 'vtt', 'ass', 'ssa', 'sub']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'bmp']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'flac', 'aac', 'm4a', 'wav', 'ogg', 'opus', 'ac3', 'eac3', 'dts']);

const IGNORED_LINK_PATTERNS = [
  /^javascript:/i,
  /^mailto:/i,
  /^tel:/i,
  /^#/i,
  /\?(C=[NSMDA]|O=[AD]|sort=|order=)/i,
  /\/_h5ai\//i,
  /\.(css|js|ico|woff|woff2|ttf|eot|svg|php|html?)$/i,
];

const EXTERNAL_JUNK_DOMAINS = [
  'facebook.com',
  'youtube.com',
  'twitter.com',
  'instagram.com',
  'google.com',
  'translate.google.com',
  'browsehappy.com',
  't.me',
  'discord.gg',
  'larsjung.de',
  'bnet-bd.com',
];

const CATEGORY_KEYWORDS = [
  'english movies',
  'hindi movies',
  'south indian',
  'south-movie',
  'hindi dubbed',
  'dual-audio',
  'dual audio',
  'imdb top',
  'imdb-top',
  'top-250',
  'top 250',
  'foreign',
  'bangla',
  'kolkata',
  '3d movies',
  'animation',
  'anime',
  'cartoon',
  'tv series',
  'web series',
  'tv-series',
  'serias',
  'korean',
  'turkish',
  'documentary',
  'award',
  'oscar',
  'marvel',
  'dc movies',
  'dhaka-flix',
  'ftp-',
  'movies collection',
  'movie-series-collection',
  'english-movies-4k',
  'all movies',
  'hollywood',
  'bollywood',
  'tollywood',
  'malayalam',
  'tamil',
  'telugu',
  'kannada',
  'pakistani',
  'natok',
  'wrestling',
  'wwe',
  'aew',
  'today',
  'upload',
];

export function formatBytes(bytes?: number): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i >= 2 ? 2 : 0)} ${units[i]}`;
}

export function parseSizeString(sizeStr: string): number | undefined {
  if (!sizeStr) return undefined;
  const clean = sizeStr.trim().toUpperCase();
  if (clean === '-' || clean === '') return undefined;
  const match = clean.match(/^([\d.,]+)\s*([KMGTP]?I?B?)$/);
  if (!match) return undefined;
  const num = parseFloat(match[1].replace(/,/g, ''));
  if (isNaN(num)) return undefined;
  const unit = match[2];
  if (unit.startsWith('T')) return Math.round(num * 1024 ** 4);
  if (unit.startsWith('G')) return Math.round(num * 1024 ** 3);
  if (unit.startsWith('M')) return Math.round(num * 1024 ** 2);
  if (unit.startsWith('K')) return Math.round(num * 1024);
  return Math.round(num);
}

export function extractMediaMetadata(rawName: string, isDirectory: boolean): {
  cleanTitle: string;
  mediaKind: MediaKind;
  year?: number;
  quality?: string;
  audioTag?: string;
  codecTag?: string;
  season?: number;
  episode?: number;
  extension?: string;
  rankNumber?: number;
} {
  let decoded = rawName;
  try {
    decoded = decodeURIComponent(rawName);
  } catch {
    decoded = rawName;
  }
  decoded = decoded.replace(/\/+$/, '').trim();

  // Check extension if not directory
  let extension: string | undefined;
  let nameWithoutExt = decoded;
  if (!isDirectory) {
    const lastDot = decoded.lastIndexOf('.');
    if (lastDot > 0 && lastDot < decoded.length - 1) {
      extension = decoded.slice(lastDot + 1).toLowerCase();
      nameWithoutExt = decoded.slice(0, lastDot);
    }
  }

  if (!isDirectory && extension) {
    if (SUBTITLE_EXTENSIONS.has(extension)) {
      return {
        cleanTitle: nameWithoutExt,
        mediaKind: 'subtitle',
        extension,
      };
    }
    if (IMAGE_EXTENSIONS.has(extension)) {
      return {
        cleanTitle: nameWithoutExt,
        mediaKind: 'image',
        extension,
      };
    }
    if (AUDIO_EXTENSIONS.has(extension)) {
      return {
        cleanTitle: nameWithoutExt,
        mediaKind: 'audio',
        extension,
      };
    }
  }

  const isVideoFile = !isDirectory && !!extension && VIDEO_EXTENSIONS.has(extension);
  if (!isDirectory && !isVideoFile) {
    return {
      cleanTitle: decoded,
      mediaKind: 'other',
      extension,
    };
  }

  // Special check for renowned TV series titled with year numbers (e.g. 1923, 1883, 1899, 1983, 1992, 1971)
  const isSeriesYearTitle = /^(1883|1899|1923|1983|1992|1971)(?:[\s\.\-_]+(?:19|20)\d{2})?$/i.test(decoded);
  if (isDirectory && isSeriesYearTitle) {
    const titleMatch = decoded.match(/^(1883|1899|1923|1983|1992|1971)/i);
    const yrMatch = decoded.match(/(?:19|20)\d{2}$/);
    return {
      cleanTitle: titleMatch ? titleMatch[1] : decoded,
      mediaKind: 'series',
      year: yrMatch ? parseInt(yrMatch[0], 10) : undefined,
    };
  }

  // Check if it's a pure Year or Era folder like "2026", "2025", "2024", "(2024)", "1995 and Before", "1960-1994"
  const singleYearMatch = decoded.match(/^[\(\[\s]*((?:19[5-9]\d|20[0-2]\d))[\)\]\s]*$/);
  const eraFolderMatch =
    decoded.match(/^[\(\[\s]*((?:19|20)\d{2})[\)\]\s]*(?:and|&|-|\s)*before[\)\]\s]*$/i) ||
    decoded.match(/^[\(\[\s]*(1960\s*[-–&]+\s*1994|1990\s*[-–&]+\s*2000)[\)\]\s]*$/);
  const yearFolderMatch = singleYearMatch || eraFolderMatch;

  if (isDirectory && yearFolderMatch) {
    const firstYear = parseInt(yearFolderMatch[1].slice(0, 4), 10);
    return {
      cleanTitle: decoded.replace(/[\(\)]/g, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim(),
      mediaKind: 'year_folder',
      year: firstYear,
    };
  }

  // Check if it's an A-Z alphabetical bucket folder like "A", "B", "M - P", "# (Numbers)"
  if (isDirectory && (/^[A-Z](\s*[-–]\s*[A-Z])?$/i.test(decoded) || /^0-9|#/i.test(decoded))) {
    return {
      cleanTitle: decoded,
      mediaKind: 'category_folder',
    };
  }

  // Check for rank number prefix like "1. The Shawshank Redemption (1994)" or "042 - Pulp Fiction"
  let rankNumber: number | undefined;
  let working = nameWithoutExt;
  const rankMatch = working.match(/^(\d{1,3})\s*[\.\)\-]\s+(.+)$/);
  if (rankMatch && !/^(19|20)\d{2}$/.test(rankMatch[1])) {
    rankNumber = parseInt(rankMatch[1], 10);
    working = rankMatch[2];
  }

  // Check for Season / Episode markers
  let season: number | undefined;
  let episode: number | undefined;

  const seMatch =
    working.match(/\bS(\d{1,2})\s*[\.\-_ ]?\s*E(\d{1,3})\b/i) ||
    working.match(/\bSeason\s*(\d{1,2})\s*[-_ ]*\s*Episode\s*(\d{1,3})\b/i) ||
    working.match(/\b(\d{1,2})x(\d{2,3})\b/);
  if (seMatch) {
    season = parseInt(seMatch[1], 10);
    episode = parseInt(seMatch[2], 10);
  } else {
    const epOnlyMatch = working.match(/\b(?:Episode|Ep|E)\s*[\.\-_ ]?(\d{1,3})\b/i);
    const seasonOnlyMatch = working.match(/\b(?:Season|S)\s*(\d{1,2})\b/i);
    if (seasonOnlyMatch) {
      season = parseInt(seasonOnlyMatch[1], 10);
    }
    if (epOnlyMatch && !isDirectory) {
      episode = parseInt(epOnlyMatch[1], 10);
    }
  }

  // Extract Quality tags
  const qualityParts: string[] = [];
  if (/\b(2160p|4k|uhd)\b/i.test(working)) qualityParts.push('4K UHD');
  else if (/\b1080p\b/i.test(working)) qualityParts.push('1080p');
  else if (/\b720p\b/i.test(working)) qualityParts.push('720p');
  else if (/\b480p\b/i.test(working)) qualityParts.push('480p');

  if (/\bimax\b/i.test(working)) qualityParts.push('IMAX');
  if (/\b(bluray|blu-ray|bdrip|brrip)\b/i.test(working)) qualityParts.push('BluRay');
  else if (/\b(web-dl|webdl|webrip|amzn|nf|dsnp|atvp|hmax)\b/i.test(working))
    qualityParts.push('WEB-DL');
  else if (/\b(hdrip|hdtv|dvdrip|camrip|hdcam|hdts)\b/i.test(working))
    qualityParts.push('HDRip');

  if (/\b(hdr10\+?|dolby\s*vision|dv|10bit|10-bit)\b/i.test(working)) qualityParts.push('HDR');

  const quality = qualityParts.length > 0 ? qualityParts.slice(0, 2).join(' ') : undefined;

  // Extract Audio Tags
  const audioParts: string[] = [];
  if (/\b(dual[\s\.\-_]*audio|multi[\s\.\-_]*audio)\b/i.test(working)) {
    audioParts.push('Dual Audio');
  }
  if (/\b(hindi[\s\.\-_]*dubbed|hin[\s\.\-_]*eng|hindi[\s\.\-_]*english)\b/i.test(working)) {
    if (!audioParts.includes('Dual Audio')) audioParts.push('Hindi Dubbed');
  }
  if (/\b(atmos|truehd)\b/i.test(working)) audioParts.push('Atmos');
  else if (/\b(ddp?[\s\.\-]?5\.1|5\.1|7\.1|dts|ac3|eac3)\b/i.test(working))
    audioParts.push('5.1 Audio');

  const audioTag = audioParts.length > 0 ? audioParts.join(' · ') : undefined;

  // Extract Codec Tag
  let codecTag: string | undefined;
  if (/\b(x265|h\.?265|hevc)\b/i.test(working)) codecTag = 'HEVC';
  else if (/\b(x264|h\.?264|avc)\b/i.test(working)) codecTag = 'H.264';
  else if (/\bav1\b/i.test(working)) codecTag = 'AV1';

  // Extract Release Year (1920 - 2029)
  let year: number | undefined;
  let titleCutIndex = working.length;

  const bracketYearRegex = /[\(\[\.\s\-_]((19[2-9]\d|20[0-2]\d))[\)\]\.\s\-_]/g;
  let match: RegExpExecArray | null;
  while ((match = bracketYearRegex.exec(working)) !== null) {
    const candidateYear = parseInt(match[1], 10);
    if (match.index > 1) {
      year = candidateYear;
      titleCutIndex = Math.min(titleCutIndex, match.index);
    }
  }

  if (!year) {
    const endYearMatch = working.match(/^(.+?)[\s\.\-_(\[]+((?:19[2-9]\d|20[0-2]\d))[\)\]]*$/);
    if (endYearMatch && endYearMatch[1].trim().length >= 1) {
      year = parseInt(endYearMatch[2], 10);
      titleCutIndex = Math.min(titleCutIndex, endYearMatch[1].length);
    }
  }

  // Check if directory is a Category / Hub folder (when it has no release year or season/episode markers)
  const lowerDecoded = decoded.toLowerCase();
  if (isDirectory && !season && !year && !episode && !rankNumber) {
    const isCat =
      CATEGORY_KEYWORDS.some((kw) => lowerDecoded.includes(kw)) ||
      /^(?:4k[\s\-_]*movies|dual[\s\-_]*audio|multi[\s\-_]*audio|hindi[\s\-_]*4k[\s\-_]*movies|english[\s\-_]*movies[\s\-_]*4k|other|extras?|featurettes?)$/i.test(
        decoded
      );
    if (isCat) {
      return {
        cleanTitle: decoded.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim(),
        mediaKind: 'category_folder',
      };
    }
  }

  // Cut off at technical markers
  const techCutMatch = working.match(
    /\b(S\d{1,2}E\d{1,3}|S\d{1,2}|Season\s*\d+|2160p|1080p|720p|480p|4K|UHD|BluRay|Blu-Ray|WEB-DL|WEBDL|WEBRip|HDRip|BDRip|BRRip|DVDRip|CAMRip|HDCAM|x264|x265|HEVC|H\.264|H\.265|Dual[\s\.\-_]*Audio|Hindi[\s\.\-_]*Dubbed|REPACK|PROPER|EXTENDED|UNRATED|DIRECTORS\.CUT|IMAX|reencoded)\b/i
  );
  if (techCutMatch && techCutMatch.index !== undefined && techCutMatch.index > 1) {
    titleCutIndex = Math.min(titleCutIndex, techCutMatch.index);
  }

  let cleanTitle = working.slice(0, titleCutIndex);
  cleanTitle = cleanTitle
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^\)]*\)/g, ' ')
    .replace(/[\._\-]+/g, ' ')
    .replace(/\s*[-–:]+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanTitle) {
    cleanTitle = working.replace(/[\._\-]+/g, ' ').trim() || decoded;
  }

  if (isDirectory && /^Season\s*\d+|^S\d{1,2}$/i.test(decoded)) {
    return {
      cleanTitle: decoded,
      mediaKind: 'series',
      season,
    };
  }

  let mediaKind: MediaKind = 'generic_folder';
  if (!isDirectory && isVideoFile) {
    if (season !== undefined || episode !== undefined) {
      mediaKind = 'episode';
    } else {
      mediaKind = 'movie';
    }
  } else if (isDirectory) {
    const hasYearSpan = /.+[\s\.\-_(\[]+(?:19|20)\d{2}\s*[-–]\s*(?:19|20)\d{2}/i.test(working);
    if (
      season !== undefined ||
      episode !== undefined ||
      hasYearSpan ||
      isSeasonFolderName(decoded) ||
      /\b(complete|series|season|episodes?)\b/i.test(decoded)
    ) {
      mediaKind = 'series';
    } else if (
      year !== undefined ||
      quality !== undefined ||
      audioTag !== undefined ||
      rankNumber !== undefined
    ) {
      mediaKind = 'movie';
    } else {
      mediaKind = 'generic_folder';
    }
  }

  return {
    cleanTitle,
    mediaKind,
    year,
    quality,
    audioTag,
    codecTag,
    season,
    episode,
    extension,
    rankNumber,
  };
}

export function buildBreadcrumbs(targetUrl: string): {
  serverName: string;
  parentUrl: string | null;
  breadcrumbs: { label: string; url: string }[];
} {
  try {
    const u = new URL(targetUrl);
    const serverName = u.host;
    const segments = u.pathname.split('/').filter(Boolean);
    const breadcrumbs: { label: string; url: string }[] = [
      { label: u.host, url: `${u.protocol}//${u.host}/` },
    ];

    let accumPath = '/';
    for (const seg of segments) {
      accumPath += `${seg}/`;
      let decodedSeg = seg;
      try {
        decodedSeg = decodeURIComponent(seg);
      } catch {
        decodedSeg = seg;
      }
      breadcrumbs.push({
        label: decodedSeg,
        url: `${u.protocol}//${u.host}${accumPath}`,
      });
    }

    let parentUrl: string | null = null;
    if (segments.length > 0) {
      const parentSegments = segments.slice(0, -1);
      parentUrl =
        parentSegments.length === 0
          ? `${u.protocol}//${u.host}/`
          : `${u.protocol}//${u.host}/${parentSegments.join('/')}/`;
    }

    return { serverName, parentUrl, breadcrumbs };
  } catch {
    return {
      serverName: targetUrl,
      parentUrl: null,
      breadcrumbs: [{ label: targetUrl, url: targetUrl }],
    };
  }
}

export function parseDirectoryHtml(
  html: string,
  baseUrl: string,
  fetchedVia: DirectoryBrowseResult['fetchedVia'] = 'backend'
): DirectoryBrowseResult {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  let baseObj: URL;
  try {
    baseObj = new URL(normalizedBaseUrl);
  } catch {
    baseObj = new URL('http://localhost/');
  }

  const isH5ai = /_h5ai/i.test(html) || /powered by Dhaka Flix/i.test(html);
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch
    ? titleMatch[1].replace(/\s+/g, ' ').trim()
    : baseObj.host;

  const { serverName, parentUrl, breadcrumbs } = buildBreadcrumbs(normalizedBaseUrl);
  const isRootPath = baseObj.pathname === '/' || baseObj.pathname === '/index.html';

  const anchorRegex = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seenUrls = new Set<string>();
  const items: ParsedFtpItem[] = [];
  const subtitles: ParsedFtpItem[] = [];
  let localPosterUrl: string | undefined;

  let m: RegExpExecArray | null;
  while ((m = anchorRegex.exec(html)) !== null) {
    const rawHref = m[1].trim();
    const rawInnerHtml = m[2];
    const linkText = rawInnerHtml
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#039;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();

    if (!rawHref) continue;
    if (IGNORED_LINK_PATTERNS.some((rx) => rx.test(rawHref))) continue;
    if (
      linkText.toLowerCase() === 'parent directory' ||
      linkText === '..' ||
      linkText === '../' ||
      rawHref === '../' ||
      rawHref === '..'
    ) {
      continue;
    }

    let resolvedUrl: URL;
    try {
      resolvedUrl = new URL(rawHref, normalizedBaseUrl);
    } catch {
      continue;
    }

    if (!['http:', 'https:', 'ftp:'].includes(resolvedUrl.protocol)) continue;

    const lowerHost = resolvedUrl.hostname.toLowerCase();
    if (EXTERNAL_JUNK_DOMAINS.some((d) => lowerHost.includes(d))) continue;
    if (resolvedUrl.port === '8096') continue;

    if (resolvedUrl.href === normalizedBaseUrl || resolvedUrl.href === baseObj.href) continue;
    if (parentUrl && resolvedUrl.href === parentUrl) continue;

    const sameHost = resolvedUrl.host === baseObj.host;
    const isSisterCluster =
      (/^(172\.16\.|10\.|192\.168\.)/.test(baseObj.hostname) &&
        /^(172\.16\.|10\.|192\.168\.)/.test(resolvedUrl.hostname)) ||
      (baseObj.hostname.endsWith('.ftpbd.net') && resolvedUrl.hostname.endsWith('.ftpbd.net'));

    if (!sameHost && !isSisterCluster && !isRootPath) {
      continue;
    }

    const pathSegments = resolvedUrl.pathname.split('/').filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1] || '';
    const hasFileExtension = /\.[a-z0-9]{2,5}$/i.test(lastSegment) && !/\.\d+$/.test(lastSegment);
    const fileExt = hasFileExtension ? lastSegment.split('.').pop()?.toLowerCase() || '' : '';
    const isMediaFile = fileExt && (VIDEO_EXTENSIONS.has(fileExt) || SUBTITLE_EXTENSIONS.has(fileExt) || IMAGE_EXTENSIONS.has(fileExt));

    if (sameHost && !isRootPath) {
      const decodedBase = decodeURIComponent(baseObj.pathname).replace(/\/+$/, '');
      const decodedTarget = decodeURIComponent(resolvedUrl.pathname);

      // Verify child item is within or relative to the requested directory
      if (!decodedTarget.startsWith(decodedBase)) {
        if (!isMediaFile) continue;
      }
      const relativePath = decodedTarget.startsWith(decodedBase)
        ? decodedTarget.slice(decodedBase.length)
        : decodedTarget;
      const cleanRelSegments = relativePath.split('/').filter(Boolean);

      // For subfolders, only accept direct 1st-level children to prevent infinite recursion
      // For media files, allow up to 3 levels deep (e.g. /1080p/movie.mkv or /CD1/movie.mkv or /Subs/en.srt)
      if (!isMediaFile && cleanRelSegments.length !== 1) {
        continue;
      }
      if (isMediaFile && (cleanRelSegments.length < 1 || cleanRelSegments.length > 3)) {
        continue;
      }
    }

    if (seenUrls.has(resolvedUrl.href)) continue;
    seenUrls.add(resolvedUrl.href);

    const isDirectory =
      rawHref.endsWith('/') ||
      resolvedUrl.pathname.endsWith('/') ||
      (!hasFileExtension && resolvedUrl.pathname !== '/');

    const finalUrl =
      isDirectory && !resolvedUrl.href.endsWith('/')
        ? `${resolvedUrl.href}/`
        : resolvedUrl.href;

    const afterSlice = html.slice(m.index + m[0].length, m.index + m[0].length + 380);
    const afterText = afterSlice
      .replace(/<\/tr>/i, '\n')
      .split('\n')[0]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    let lastModified = '';
    const dateMatch =
      afterText.match(/(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?)/) ||
      afterText.match(/(\d{2}-[A-Za-z]{3}-\d{4}(?:\s+\d{2}:\d{2})?)/);
    if (dateMatch) {
      lastModified = dateMatch[1];
    }

    let sizeBytes: number | undefined;
    let sizeFormatted = '';
    if (!isDirectory) {
      const textAfterDate = dateMatch
        ? afterText.slice((dateMatch.index || 0) + dateMatch[0].length).trim()
        : afterText;
      const sizeMatch = textAfterDate.match(
        /\b(\d+(?:[\.,]\d+)?\s*(?:[KMGTP]i?B|[KMGTP])\b|\d{4,13}\b)/i
      );
      if (sizeMatch) {
        sizeBytes = parseSizeString(sizeMatch[1]);
        sizeFormatted = sizeBytes ? formatBytes(sizeBytes) : sizeMatch[1];
      }
    }

    let rawName = lastSegment;
    try {
      rawName = decodeURIComponent(lastSegment);
    } catch {
      rawName = lastSegment;
    }

    if (isRootPath && linkText && linkText.length >= 2 && !/^http/i.test(linkText)) {
      rawName = linkText;
    } else if (!rawName && linkText) {
      rawName = linkText;
    }

    if (!rawName || rawName === '/' || rawName === 'index.html' || rawName === 'www.ftpbd.net') {
      continue;
    }

    if (!isDirectory && /sample/i.test(rawName) && sizeBytes && sizeBytes < 20 * 1024 * 1024) {
      continue;
    }

    const meta = extractMediaMetadata(rawName, isDirectory);

    const parentSegment = breadcrumbs[breadcrumbs.length - 1]?.label || '';
    const parentYearMatch = parentSegment.match(/((?:19|20)\d{2})/);
    const parentIsMovieHub = /movie|imdb|top|cinema|film|dubbed|dual|hollywood|bollywood|bangla|foreign|animation|3d/i.test(
      decodeURIComponent(baseObj.pathname)
    );
    const parentIsSeriesHub = /series|serias|(\/|^)tv(\/|$)|tv[\s\-_/]|season|anime|cartoon|drama|show|\btv\b|dhaka-flix-12|dhaka-flix-9|ftp-4/i.test(
      decodeURIComponent(baseObj.pathname)
    );

    if (isDirectory) {
      if (parentIsSeriesHub) {
        if (meta.mediaKind !== 'category_folder') {
          meta.mediaKind = 'series';
        }
      } else if (meta.mediaKind !== 'year_folder' && meta.mediaKind !== 'category_folder') {
        if (meta.mediaKind === 'generic_folder' && (parentYearMatch || parentIsMovieHub)) {
          meta.mediaKind = 'movie';
          if (!meta.year && parentYearMatch && !/\d{4}\s*-\s*\d{4}/.test(parentSegment)) {
            meta.year = parseInt(parentYearMatch[1], 10);
          }
        }
      }
    }

    // Inherit Dual Audio tag if inside a Dual-Audio folder
    if (
      /dual[\s\-_]*audio/i.test(decodeURIComponent(baseObj.pathname)) &&
      !meta.audioTag &&
      (meta.mediaKind === 'movie' || meta.mediaKind === 'series')
    ) {
      meta.audioTag = 'Dual Audio';
    }

    const item: ParsedFtpItem = {
      id: finalUrl,
      rawName,
      cleanTitle: meta.cleanTitle,
      url: finalUrl,
      isDirectory,
      sizeBytes,
      sizeFormatted,
      lastModified,
      mediaKind: meta.mediaKind,
      year: meta.year,
      quality: meta.quality,
      audioTag: meta.audioTag,
      codecTag: meta.codecTag,
      season: meta.season,
      episode: meta.episode,
      extension: meta.extension,
      rankNumber: meta.rankNumber,
    };

    if (meta.mediaKind === 'subtitle') {
      subtitles.push(item);
    } else if (meta.mediaKind === 'image') {
      if (!localPosterUrl || /poster|cover|folder|thumb|fanart/i.test(rawName)) {
        localPosterUrl = finalUrl;
      }
      items.push(item);
    } else {
      items.push(item);
    }
  }

  if (localPosterUrl) {
    for (const item of items) {
      if (item.mediaKind === 'movie' || item.mediaKind === 'episode') {
        item.posterUrl = localPosterUrl;
      }
    }
  }

  return {
    url: normalizedBaseUrl,
    serverName,
    pageTitle,
    isH5ai,
    isPortalRoot: isRootPath,
    parentUrl,
    breadcrumbs,
    items,
    localPosterUrl,
    subtitles,
    fetchedVia,
  };
}

export function convertSrtToVtt(srtContent: string, offsetSeconds = 0): string {
  const normalized = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (normalized.startsWith('WEBVTT')) {
    return normalized;
  }

  const shiftTimestamp = (timeStr: string): string => {
    const clean = timeStr.trim().replace(',', '.');
    const parts = clean.split(':');
    if (parts.length !== 3) return clean;
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    const secParts = parts[2].split('.');
    const seconds = parseInt(secParts[0], 10) || 0;
    const ms = parseInt((secParts[1] || '0').padEnd(3, '0').slice(0, 3), 10) || 0;

    let totalMs =
      (hours * 3600 + minutes * 60 + seconds) * 1000 +
      ms +
      Math.round(offsetSeconds * 1000);
    if (totalMs < 0) totalMs = 0;

    const outH = Math.floor(totalMs / 3600000);
    totalMs %= 3600000;
    const outM = Math.floor(totalMs / 60000);
    totalMs %= 60000;
    const outS = Math.floor(totalMs / 1000);
    const outMs = totalMs % 1000;

    return `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}:${String(outS).padStart(2, '0')}.${String(outMs).padStart(3, '0')}`;
  };

  const lines = normalized.split('\n');
  const outLines: string[] = ['WEBVTT', ''];

  for (const line of lines) {
    const timeMatch = line.match(
      /(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})(.*)/
    );
    if (timeMatch) {
      const start = shiftTimestamp(timeMatch[1]);
      const end = shiftTimestamp(timeMatch[2]);
      outLines.push(`${start} --> ${end}${timeMatch[3] || ''}`);
    } else {
      outLines.push(line);
    }
  }

  return outLines.join('\n');
}

export function isPrivateOrBdixUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const h = u.hostname;
    return (
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(h) ||
      /^10\./.test(h) ||
      /^192\.168\./.test(h)
    );
  } catch {
    return false;
  }
}

/**
 * Translate private local BDIX LAN URLs (such as DhakaFlix 172.16.50.7, 172.16.50.14, 172.16.50.12, 172.16.50.9, 172.16.50.4)
 * to the live publicly routable BDIX HTTPS server cluster (server2.ftpbd.net, server3.ftpbd.net, etc.)
 */
export function resolvePublicBdixGatewayUrl(rawUrl: string): string | null {
  // Desktop (Electron) app: talk to private LAN servers directly instead of public mirrors.
  if (typeof navigator !== 'undefined' && /Electron\//i.test(navigator.userAgent)) return null;
  if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) return null; // Android app
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();
    const isPrivateIp =
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      host.includes('discoveryftp') ||
      host.includes('dhakaflix');

    if (!isPrivateIp) return null;

    let decodedPath = u.pathname;
    try {
      decodedPath = decodeURIComponent(u.pathname);
    } catch {}

    const lowerPath = decodedPath.toLowerCase();

    // Root Portal Page (e.g., http://172.16.50.7/ or http://172.16.50.4/)
    if (decodedPath === '/' || decodedPath === '' || decodedPath === '/index.html') {
      return 'PORTAL_ROOT';
    }

    const isFile = /\.[a-z0-9]{2,5}$/i.test(decodedPath);
    const trailSlash = isFile ? '' : '/';

    const cleanSubSegments = (segments: string[]) =>
      segments.map((seg) => {
        const s = seg.trim();
        if (/^\(1960-1994\)|^\(1995\)/i.test(s)) return '1995%20and%20Before';
        const yr = s.match(/^\(((?:19|20)\d{2})\)$/);
        if (yr) return yr[1];
        return encodeURIComponent(s);
      });

    const parts = decodedPath.split('/').filter(Boolean);

    if (lowerPath.includes('imdb') || lowerPath.includes('top-250') || lowerPath.includes('top 250')) {
      const idx = parts.findIndex((p) => /imdb|top/i.test(p));
      const rest = idx >= 0 ? cleanSubSegments(parts.slice(idx + 1)) : [];
      return `https://server2.ftpbd.net/FTP-2/English%20Movies/IMDB-TOP-250/${rest.length ? rest.join('/') + trailSlash : ''}`;
    }

    if (lowerPath.includes('dual-audio') || lowerPath.includes('dual audio') || lowerPath.includes('hindi dubbed')) {
      if (lowerPath.includes('south')) {
        const idx = parts.findIndex((p) => /south|dubbed/i.test(p));
        const rest = idx >= 0 ? cleanSubSegments(parts.slice(idx + 1)) : [];
        return `https://server3.ftpbd.net/FTP-3/South%20Indian%20Movies/${rest.length ? rest.join('/') + trailSlash : ''}`;
      }
      const idx = parts.findIndex((p) => /dual|dubbed/i.test(p));
      const rest = idx >= 0 ? cleanSubSegments(parts.slice(idx + 1)) : [];
      return `https://server2.ftpbd.net/FTP-2/English%20Movies/Dual-Audio/${rest.length ? rest.join('/') + trailSlash : ''}`;
    }

    if (lowerPath.includes('4k')) {
      return 'https://server2.ftpbd.net/FTP-2/English%20Movies/English-Movies-4K/';
    }

    if (lowerPath.includes('english movie')) {
      const idx = parts.findIndex((p) => /english\s*movie/i.test(p));
      const rest = idx >= 0 ? cleanSubSegments(parts.slice(idx + 1)) : [];
      return `https://server2.ftpbd.net/FTP-2/English%20Movies/${rest.length ? rest.join('/') + trailSlash : ''}`;
    }

    if (lowerPath.includes('hindi movie')) {
      const idx = parts.findIndex((p) => /hindi\s*movie/i.test(p));
      const rest = idx >= 0 ? cleanSubSegments(parts.slice(idx + 1)) : [];
      return `https://server3.ftpbd.net/FTP-3/Hindi%20Movies/${rest.length ? rest.join('/') + trailSlash : ''}`;
    }

    if (lowerPath.includes('south')) {
      const idx = parts.findIndex((p) => /south/i.test(p));
      const rest = idx >= 0 ? cleanSubSegments(parts.slice(idx + 1)) : [];
      return `https://server3.ftpbd.net/FTP-3/South%20Indian%20Movies/${rest.length ? rest.join('/') + trailSlash : ''}`;
    }

    if (lowerPath.includes('foreign')) {
      const idx = parts.findIndex((p) => /foreign/i.test(p));
      const rest = idx >= 0 ? cleanSubSegments(parts.slice(idx + 1)) : [];
      return `https://server3.ftpbd.net/FTP-3/Foreign%20Language%20Movies/${rest.length ? rest.join('/') + trailSlash : ''}`;
    }

    if (lowerPath.includes('bangla') || lowerPath.includes('kolkata')) {
      const idx = parts.findIndex((p) => /bangla|kolkata/i.test(p));
      const rest = idx >= 0 ? cleanSubSegments(parts.slice(idx + 1)) : [];
      return `https://server3.ftpbd.net/FTP-3/Bangla%20Collection/BANGLA/${rest.length ? rest.join('/') + trailSlash : ''}`;
    }

    if (lowerPath.includes('3d')) {
      const idx = parts.findIndex((p) => /3d/i.test(p));
      const rest = idx >= 0 ? cleanSubSegments(parts.slice(idx + 1)) : [];
      return `https://server2.ftpbd.net/FTP-2/3D%20Movies/${rest.length ? rest.join('/') + trailSlash : ''}`;
    }

    if (lowerPath.includes('animation')) {
      const idx = parts.findIndex((p) => /animation/i.test(p));
      const rest = idx >= 0 ? cleanSubSegments(parts.slice(idx + 1)) : [];
      return `https://server5.ftpbd.net/FTP-5/Animation%20Movies/${rest.length ? rest.join('/') + trailSlash : ''}`;
    }

    if (lowerPath.includes('anime') || lowerPath.includes('cartoon')) {
      const idx = parts.findIndex((p) => /anime|cartoon/i.test(p));
      const rest = idx >= 0 ? cleanSubSegments(parts.slice(idx + 1)) : [];
      return `https://server5.ftpbd.net/FTP-5/Anime--Cartoon-TV-Series/${rest.length ? rest.join('/') + trailSlash : ''}`;
    }

    if (
      lowerPath.includes('series') ||
      lowerPath.includes('tv') ||
      lowerPath.includes('dhaka-flix-12') ||
      lowerPath.includes('dhaka-flix-14') ||
      lowerPath.includes('korean')
    ) {
      if (lowerPath.includes('hindi tv') || (lowerPath.includes('hindi') && !lowerPath.includes('english'))) {
        const filteredRest = parts.filter(
          (p) => !/^(dhaka-flix-\d+|tv-web-series|tv\s*series|web\s*series|hindi\s*tv\s*series)$/i.test(p.trim())
        );
        const rest = cleanSubSegments(filteredRest);
        return `https://server3.ftpbd.net/FTP-3/Hindi%20TV%20Series/${rest.length ? rest.join('/') + trailSlash : ''}`;
      }

      // Check known series mappings
      let knownSeriesFolder = '';
      if (lowerPath.includes('teach you a lesson') || lowerPath.includes('teach-you-a-lesson')) {
        knownSeriesFolder = 'Teach-You-a-Lesson-2026';
      } else if (lowerPath.includes('tale of the nine tailed') || lowerPath.includes('nine-tailed')) {
        knownSeriesFolder = 'Tale-of-the-Nine-Tailed-2020';
      } else if (lowerPath.includes('bloodhounds')) {
        knownSeriesFolder = 'Bloodhounds-2023';
      } else if (lowerPath.includes('melancholia')) {
        knownSeriesFolder = 'Melancholia-2021';
      } else if (lowerPath.includes('boyfriend on demand') || lowerPath.includes('boyfriend-on-demand')) {
        knownSeriesFolder = 'Boyfriend-on-Demand-2026';
      } else if (lowerPath.includes('if wishes could kill') || lowerPath.includes('wishes-could-kill')) {
        knownSeriesFolder = 'If-Wishes-Could-Kill-2026';
      } else if (lowerPath.includes('sirens kiss') || lowerPath.includes('sirens-kiss')) {
        knownSeriesFolder = 'Sirens-Kiss-2026';
      } else if (lowerPath.includes('lovely horribly') || lowerPath.includes('lovely runner') || lowerPath.includes('lovely-runner')) {
        knownSeriesFolder = 'Lovely-Runner-2024';
      } else if (lowerPath.includes('undercover')) {
        knownSeriesFolder = 'Undercover-High-School-2025';
      }

      if (knownSeriesFolder) {
        // Find if there are deeper segments (Season, Episode file)
        const seriesIdx = parts.findIndex(
          (p) =>
            /teach|nine|bloodhounds|melancholia|boyfriend|wishes|sirens|lovely|undercover/i.test(p)
        );
        const sub = seriesIdx >= 0 ? cleanSubSegments(parts.slice(seriesIdx + 1)) : [];
        return `https://server4.ftpbd.net/FTP-4/English-Foreign-TV-Series/${knownSeriesFolder}/${sub.length ? sub.join('/') + trailSlash : ''}`;
      }

      const filteredRest = parts.filter(
        (p) =>
          !/^(dhaka-flix-\d+|tv-web-series|tv\s*series|web\s*series|english-foreign-tv-series|korean\s*tv(?:\s*&|\s*%26)?\s*web\s*series|korean\s*tv|korean)$/i.test(
            p.trim()
          )
      );
      const rest = cleanSubSegments(filteredRest);
      return `https://server4.ftpbd.net/FTP-4/English-Foreign-TV-Series/${rest.length ? rest.join('/') + trailSlash : ''}`;
    }

    if (lowerPath.includes('documentary')) {
      return 'https://server5.ftpbd.net/FTP-5/Documentary/';
    }

    if (lowerPath.includes('wwe') || lowerPath.includes('wrestling')) {
      return 'https://server7.ftpbd.net/FTP-7/WWE%20Wrestling/';
    }

    if (lowerPath.includes('animation')) {
      return 'https://server5.ftpbd.net/FTP-5/Animation%20Movies/';
    }

    return null;
  } catch {
    return null;
  }
}
