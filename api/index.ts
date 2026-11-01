// Allow connecting to BDIX FTP servers that use self-signed or unchained SSL certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { spawn, spawnSync } from 'child_process';
import http from 'http';
import https from 'https';
import net from 'net';
import { Readable } from 'stream';

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

function isSeasonFolderName(rawName: string): boolean {
  let decoded = rawName;
  try {
    decoded = decodeURIComponent(rawName);
  } catch {}
  decoded = decoded.replace(/\/+$/, '').trim();
  return (
    /\bSeason[\s\.\-_]*\d{1,2}\b/i.test(decoded) ||
    /^S\d{1,2}\b/i.test(decoded) ||
    /\bS\d{1,2}[\s\.\-_]+(1080p|720p|480p|2160p|Complete|English|Hindi|Dual)/i.test(decoded)
  );
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
  ' browsehappy.com',
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

function formatBytes(bytes?: number): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i >= 2 ? 2 : 0)} ${units[i]}`;
}

function parseSizeString(sizeStr: string): number | undefined {
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

function extractMediaMetadata(rawName: string, isDirectory: boolean): {
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
      return { cleanTitle: nameWithoutExt, mediaKind: 'subtitle', extension };
    }
    if (IMAGE_EXTENSIONS.has(extension)) {
      return { cleanTitle: nameWithoutExt, mediaKind: 'image', extension };
    }
    if (AUDIO_EXTENSIONS.has(extension)) {
      return { cleanTitle: nameWithoutExt, mediaKind: 'audio', extension };
    }
  }

  const isVideoFile = !isDirectory && !!extension && VIDEO_EXTENSIONS.has(extension);
  if (!isDirectory && !isVideoFile) {
    return { cleanTitle: decoded, mediaKind: 'other', extension };
  }

  // Special check for renowned TV series titled with year numbers (e.g. 1923, 1883, 1899, 1983, 1992, 11 22 63)
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

  if (isDirectory && (/^[A-Z](\s*[-–]\s*[A-Z])?$/i.test(decoded) || /^0-9|#/i.test(decoded))) {
    return { cleanTitle: decoded, mediaKind: 'category_folder' };
  }

  let rankNumber: number | undefined;
  let working = nameWithoutExt;
  const rankMatch = working.match(/^(\d{1,3})\s*[\.\)\-]\s+(.+)$/);
  if (rankMatch && !/^(19|20)\d{2}$/.test(rankMatch[1])) {
    rankNumber = parseInt(rankMatch[1], 10);
    working = rankMatch[2];
  }

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
    if (seasonOnlyMatch) season = parseInt(seasonOnlyMatch[1], 10);
    if (epOnlyMatch && !isDirectory) episode = parseInt(epOnlyMatch[1], 10);
  }

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

  let codecTag: string | undefined;
  if (/\b(x265|h\.?265|hevc)\b/i.test(working)) codecTag = 'HEVC';
  else if (/\b(x264|h\.?264|avc)\b/i.test(working)) codecTag = 'H.264';
  else if (/\bav1\b/i.test(working)) codecTag = 'AV1';

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
    return { cleanTitle: decoded, mediaKind: 'series', season };
  }

  let mediaKind: MediaKind = 'generic_folder';
  if (!isDirectory && isVideoFile) {
    mediaKind = season !== undefined || episode !== undefined ? 'episode' : 'movie';
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

function buildBreadcrumbs(targetUrl: string): {
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

function parseDirectoryHtml(
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

    if (!sameHost && !isSisterCluster && !isRootPath) continue;

    const pathSegments = resolvedUrl.pathname.split('/').filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1] || '';
    const hasFileExtension = /\.[a-z0-9]{2,5}$/i.test(lastSegment) && !/\.\d+$/.test(lastSegment);
    const fileExt = hasFileExtension ? lastSegment.split('.').pop()?.toLowerCase() || '' : '';
    const isMediaFile = fileExt && (VIDEO_EXTENSIONS.has(fileExt) || SUBTITLE_EXTENSIONS.has(fileExt) || IMAGE_EXTENSIONS.has(fileExt));

    if (sameHost && !isRootPath) {
      const decodedBase = decodeURIComponent(baseObj.pathname).replace(/\/+$/, '');
      const decodedTarget = decodeURIComponent(resolvedUrl.pathname);

      if (!decodedTarget.startsWith(decodedBase)) {
        if (!isMediaFile) continue;
      }
      const relativePath = decodedTarget.startsWith(decodedBase)
        ? decodedTarget.slice(decodedBase.length)
        : decodedTarget;
      const cleanRelSegments = relativePath.split('/').filter(Boolean);

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
    if (dateMatch) lastModified = dateMatch[1];

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

function convertSrtToVtt(srtContent: string, offsetSeconds = 0): string {
  const normalized = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (normalized.startsWith('WEBVTT')) return normalized;

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

export const app = express();

// Detect once whether ffmpeg & ffprobe binaries exist in this runtime (true on Cloud Run / Docker / Local, false on Vercel Serverless)
const HAS_FFMPEG = (() => {
  try {
    const res = spawnSync('ffmpeg', ['-version'], { timeout: 2000 });
    return res.status === 0;
  } catch {
    return false;
  }
})();

const HAS_FFPROBE = (() => {
  try {
    const res = spawnSync('ffprobe', ['-version'], { timeout: 2000 });
    return res.status === 0;
  } catch {
    return false;
  }
})();

// ffmpeg aborts with "Option tls_verify not found" on plain http:// inputs (all LAN/BDIX servers), so only pass it for https.
const tlsOpts = (u: string): string[] => (/^https:/i.test(u) ? ['-tls_verify', '0'] : []);

app.use(express.json({ limit: '10mb' }));

// Normalize Vercel Serverless rewrite URLs (/api/:path* -> /api/index?__route=:path*)
const KNOWN_API_ROUTES = new Set([
  '/browse',
  '/metadata',
  '/probe',
  '/stream',
  '/transcode',
  '/subtitle',
  '/embedded-subtitle',
  '/bdix-bridge.bat',
]);

app.use((req, _res, next) => {
  const routeParam = req.query.__route;
  if (typeof routeParam === 'string' && routeParam) {
    const u = new URL(req.url || '/', 'http://localhost');
    u.searchParams.delete('__route');
    const cleanRoute = routeParam.replace(/^\/+/, '');
    const qs = u.searchParams.toString();
    req.url = `/api/${cleanRoute}${qs ? `?${qs}` : ''}`;
  } else if (req.path && KNOWN_API_ROUTES.has(req.path)) {
    req.url = `/api${req.url}`;
  }
  next();
});

// Global CORS & Private Network headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Accept-Ranges', 'bytes');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.get(['/api/capabilities', '/capabilities', '/api/health', '/health'], (_req, res) => {
  res.json({
    isVercel: Boolean(process.env.VERCEL || process.env.NOW_REGION),
    ffmpegAvailable: HAS_FFMPEG,
    ffprobeAvailable: HAS_FFPROBE,
    nodeEnv: process.env.NODE_ENV || 'development',
  });
});

const metadataCache = new Map<string, Record<string, unknown>>();

/**
 * Translate private local BDIX LAN URLs (such as DhakaFlix 172.16.50.7, 172.16.50.14, 172.16.50.12, 172.16.50.9, 172.16.50.4)
 * to the live publicly routable BDIX h5ai server cluster when the cloud backend (Vercel / Cloud Run) cannot route to RFC1918 private IPs.
 */
export function resolvePublicBdixGatewayUrl(rawUrl: string): string | null {
  // Desktop app runs on the user's own PC/LAN: use private BDIX/DhakaFlix IPs directly, no public gateway rewrite.
  if (process.env.CINEFTP_DIRECT_LAN === '1') return null;
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

    if (lowerPath.includes('kolkata')) {
      const idx = parts.findIndex((p) => /kolkata/i.test(p));
      const rest = idx >= 0 ? cleanSubSegments(parts.slice(idx + 1)) : [];
      return `https://server3.ftpbd.net/FTP-3/Bangla%20Collection/BANGLA/Kolkata-Bangla-Movies/${rest.length ? rest.join('/') + trailSlash : ''}`;
    }

    if (lowerPath.includes('bangla')) {
      const idx = parts.findIndex((p) => /bangla/i.test(p));
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

    return null;
  } catch {
    return null;
  }
}

function buildBdixPortalRootHtml(): string {
  return `<!DOCTYPE html>
<html>
<head><title>DhakaFlix & BDIX Media Portal</title></head>
<body>
  <a href="https://server2.ftpbd.net/FTP-2/English%20Movies/">ENGLISH MOVIES</a>
  <a href="https://server2.ftpbd.net/FTP-2/English%20Movies/Dual-Audio/">ENGLISH MOVIES [DUAL AUDIO]</a>
  <a href="https://server2.ftpbd.net/FTP-2/English%20Movies/English-Movies-4K/">ENGLISH MOVIES 4K UHD</a>
  <a href="https://server2.ftpbd.net/FTP-2/English%20Movies/IMDB-TOP-250/">IMDB TOP-250 MOVIES</a>
  <a href="https://server3.ftpbd.net/FTP-3/Hindi%20Movies/">HINDI MOVIES</a>
  <a href="https://server3.ftpbd.net/FTP-3/South%20Indian%20Movies/">SOUTH INDIAN MOVIES</a>
  <a href="https://server3.ftpbd.net/FTP-3/Foreign%20Language%20Movies/">FOREIGN LANGUAGE MOVIES</a>
  <a href="https://server3.ftpbd.net/FTP-3/Bangla%20Collection/BANGLA/">BANGLA MOVIES</a>
  <a href="https://server4.ftpbd.net/FTP-4/English-Foreign-TV-Series/">ENGLISH & FOREIGN TV SERIES</a>
  <a href="https://server3.ftpbd.net/FTP-3/Hindi%20TV%20Series/">HINDI TV & WEB SERIES</a>
  <a href="https://server5.ftpbd.net/FTP-5/Animation%20Movies/">ANIMATION MOVIES</a>
  <a href="https://server5.ftpbd.net/FTP-5/Anime--Cartoon-TV-Series/">ANIME & CARTOON SERIES</a>
  <a href="https://server2.ftpbd.net/FTP-2/3D%20Movies/">3D MOVIES</a>
  <a href="https://server3.ftpbd.net/FTP-3/%5BToday%27s%20Upload%5D/">TODAY'S LATEST UPLOADS</a>
  <a href="https://server5.ftpbd.net/FTP-5/Documentary/">DOCUMENTARY COLLECTION</a>
  <a href="https://server7.ftpbd.net/FTP-7/WWE%20Wrestling/">WWE & AEW WRESTLING</a>
</body>
</html>`;
}

function toTranslateGoogProxy(rawUrl: string): {
  proxyUrl: string;
  gHost: string;
  originalOrigin: string;
} | null {
  try {
    const u = new URL(rawUrl);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    if (
      /^127\./.test(u.hostname) ||
      /^10\./.test(u.hostname) ||
      /^192\.168\./.test(u.hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(u.hostname) ||
      u.hostname === 'localhost' ||
      u.hostname.endsWith('.translate.goog')
    ) {
      return null;
    }
    const gHost = `${u.hostname.replace(/-/g, '--').replace(/\./g, '-')}.translate.goog`;
    const sep = u.search ? '&' : '?';
    const proxyUrl = `https://${gHost}${u.pathname}${u.search}${sep}_x_tr_sl=es&_x_tr_tl=en&_x_tr_hl=en`;
    return {
      proxyUrl,
      gHost,
      originalOrigin: `${u.protocol}//${u.host}`,
    };
  } catch {
    return null;
  }
}

function restoreTranslateGoogHtml(html: string, gHost: string, originalOrigin: string): string {
  const escapedGHost = gHost.replace(/\./g, '\\.');
  return html
    .replace(new RegExp(`https?://${escapedGHost}`, 'gi'), originalOrigin)
    .replace(
      /[?&]_x_tr_sl=[^"'\s>&]+(?:&amp;|&)?_x_tr_tl=[^"'\s>&]+(?:&amp;|&)?_x_tr_hl=[^"'\s>&]+(?:&amp;|&)?(?:_x_tr_pto=[^"'\s>&]+)?/gi,
      ''
    )
    .replace(/\?_x_tr_[^"'\s>]+/gi, '');
}

async function fetchSingleUrlText(
  targetUrl: string,
  options: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
  } = {}
): Promise<{ text: string; finalUrl: string; status: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 9000);

  try {
    const res = await fetch(targetUrl, {
      method: options.method || 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
        ...(options.headers || {}),
      },
      body: options.body,
      redirect: 'follow',
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok && res.status >= 400) {
      throw new Error(`HTTP ${res.status}`);
    }
    return {
      text,
      finalUrl: res.url || targetUrl,
      status: res.status,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchUrlText(
  targetUrl: string,
  options: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
  } = {}
): Promise<{ text: string; finalUrl: string; status: number }> {
  const isGet = !options.method || options.method.toUpperCase() === 'GET';
  const proxyInfo = isGet ? toTranslateGoogProxy(targetUrl) : null;

  if (!proxyInfo) {
    return fetchSingleUrlText(targetUrl, options);
  }

  const directPromise = fetchSingleUrlText(targetUrl, options);
  const proxyPromise = fetchSingleUrlText(proxyInfo.proxyUrl, {
    ...options,
    timeoutMs: options.timeoutMs ?? 9000,
  }).then((res) => ({
    text: restoreTranslateGoogHtml(res.text, proxyInfo.gHost, proxyInfo.originalOrigin),
    finalUrl: targetUrl,
    status: res.status,
  }));

  return Promise.any([directPromise, proxyPromise]);
}

async function browseNativeFtp(ftpUrlStr: string): Promise<ParsedFtpItem[]> {
  const u = new URL(ftpUrlStr);
  const host = u.hostname;
  const port = u.port ? parseInt(u.port, 10) : 21;
  const user = decodeURIComponent(u.username || 'anonymous');
  const pass = decodeURIComponent(u.password || 'anonymous@example.com');
  const remotePath = decodeURIComponent(u.pathname || '/');

  return new Promise((resolve, reject) => {
    const control = net.createConnection({ host, port }, () => {});
    control.setTimeout(10000);

    let buffer = '';
    let step = 0;
    let pasvHost = host;
    let pasvPort = 0;
    let listData = '';
    let dataSocket: net.Socket | null = null;

    const cleanup = () => {
      try {
        control.destroy();
      } catch {}
      try {
        dataSocket?.destroy();
      } catch {}
    };

    control.on('timeout', () => {
      cleanup();
      reject(new Error('FTP connection timed out'));
    });

    control.on('error', (err) => {
      cleanup();
      reject(err);
    });

    const sendCmd = (cmd: string) => {
      control.write(`${cmd}\r\n`);
    };

    control.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!/^\d{3}\s/.test(line)) continue;
        const code = parseInt(line.slice(0, 3), 10);

        if (step === 0 && code === 220) {
          step = 1;
          sendCmd(`USER ${user}`);
        } else if (step === 1 && (code === 331 || code === 230)) {
          step = 2;
          if (code === 331) sendCmd(`PASS ${pass}`);
          else {
            step = 3;
            sendCmd(`CWD ${remotePath}`);
          }
        } else if (step === 2 && code === 230) {
          step = 3;
          sendCmd(`CWD ${remotePath}`);
        } else if (step === 3 && (code === 250 || code === 200)) {
          step = 4;
          sendCmd('TYPE I');
        } else if (step === 4 && code === 200) {
          step = 5;
          sendCmd('PASV');
        } else if (step === 5 && code === 227) {
          const m = line.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
          if (!m) {
            cleanup();
            reject(new Error('Failed to parse FTP PASV response'));
            return;
          }
          const pIp = `${m[1]}.${m[2]}.${m[3]}.${m[4]}`;
          if (
            !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(pIp) ||
            /^(10\.|192\.168\.|172\.)/.test(host)
          ) {
            pasvHost = pIp;
          }
          pasvPort = parseInt(m[5], 10) * 256 + parseInt(m[6], 10);
          step = 6;

          dataSocket = net.createConnection({ host: pasvHost, port: pasvPort }, () => {
            sendCmd('LIST');
          });
          dataSocket.on('data', (d) => {
            listData += d.toString('utf8');
          });
          dataSocket.on('end', () => {
            sendCmd('QUIT');
            cleanup();
            const parsedItems = parseFtpListOutput(listData, ftpUrlStr);
            resolve(parsedItems);
          });
          dataSocket.on('error', (err) => {
            cleanup();
            reject(err);
          });
        } else if (code >= 400) {
          cleanup();
          reject(new Error(`FTP Error: ${line}`));
        }
      }
    });
  });
}

function parseFtpListOutput(listData: string, baseUrl: string): ParsedFtpItem[] {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const lines = listData.split(/\r?\n/).filter(Boolean);
  const items: ParsedFtpItem[] = [];

  for (const line of lines) {
    const unixMatch = line.match(
      /^([d\-l])[rwxst\-]{9}\s+\d+\s+\S+\s+\S+\s+(\d+)\s+([A-Za-z]{3}\s+\d+\s+[\d:]+)\s+(.+)$/
    );
    if (unixMatch) {
      const isDirectory = unixMatch[1] === 'd';
      const sizeBytes = parseInt(unixMatch[2], 10);
      const lastModified = unixMatch[3];
      const rawName = unixMatch[4].trim();
      if (rawName === '.' || rawName === '..') continue;

      const itemUrl = `${normalizedBase}${encodeURIComponent(rawName)}${isDirectory ? '/' : ''}`;
      const meta = extractMediaMetadata(rawName, isDirectory);
      items.push({
        id: itemUrl,
        rawName,
        cleanTitle: meta.cleanTitle,
        url: itemUrl,
        isDirectory,
        sizeBytes: isDirectory ? undefined : sizeBytes,
        sizeFormatted: isDirectory ? '' : formatBytes(sizeBytes),
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
      });
    }
  }
  return items;
}

async function tryH5aiJsonFetch(targetUrl: string): Promise<ParsedFtpItem[]> {
  try {
    const u = new URL(targetUrl);
    const { text } = await fetchUrlText(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'get',
        items: {
          href: u.pathname,
          what: 1,
        },
      }),
      timeoutMs: 8000,
    });

    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.items)) return [];

    const items: ParsedFtpItem[] = [];
    for (const entry of data.items) {
      if (!entry.href || entry.href === u.pathname) continue;
      const entryUrl = new URL(entry.href, `${u.protocol}//${u.host}`).href;
      if (!entryUrl.startsWith(targetUrl)) continue;
      const rel = entry.href.slice(u.pathname.length).split('/').filter(Boolean);
      if (rel.length !== 1) continue;

      const isDirectory = entry.href.endsWith('/');
      let rawName = rel[0];
      try {
        rawName = decodeURIComponent(rawName);
      } catch {}

      const sizeBytes = typeof entry.size === 'number' ? entry.size : undefined;
      const lastModified = entry.time
        ? new Date(entry.time).toISOString().slice(0, 16).replace('T', ' ')
        : '';

      const meta = extractMediaMetadata(rawName, isDirectory);
      items.push({
        id: entryUrl,
        rawName,
        cleanTitle: meta.cleanTitle,
        url: entryUrl,
        isDirectory,
        sizeBytes,
        sizeFormatted: sizeBytes ? formatBytes(sizeBytes) : '',
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
      });
    }
    return items;
  } catch {
    return [];
  }
}

const mirrorSourceCache = new Map<string, { expiresAt: number; result: DirectoryBrowseResult }>();
let server2DownUntil = 0;

async function fetchCachedDirectory(url: string, timeoutMs = 6000): Promise<DirectoryBrowseResult | null> {
  const now = Date.now();
  const cached = mirrorSourceCache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }
  try {
    const { text, finalUrl } = await fetchUrlText(url, { timeoutMs });
    const parsed = parseDirectoryHtml(text, finalUrl, 'bdix-cloud-gateway');
    if (parsed.items.length > 0) {
      mirrorSourceCache.set(url, { expiresAt: now + 5 * 60 * 1000, result: parsed });
      return parsed;
    }
  } catch {}
  return null;
}

/**
 * Automatic high-availability fallback when server2.ftpbd.net (103.58.73.7) is offline,
 * aggregating English Movies, Dual Audio Movies, 4K Movies, IMDb Top 250, and Year Folders
 * from live FTPBD cluster servers (server5/server3) and live English Movie open directories.
 */
async function buildServer2MirrorResult(
  targetUrl: string,
  originalRequestedUrl: string,
  fetchedVia: DirectoryBrowseResult['fetchedVia']
): Promise<DirectoryBrowseResult> {
  const normalizedBase = originalRequestedUrl.endsWith('/')
    ? originalRequestedUrl
    : `${originalRequestedUrl}/`;
  const { serverName, parentUrl, breadcrumbs } = buildBreadcrumbs(normalizedBase);

  let decodedPath = '';
  try {
    decodedPath = decodeURIComponent(new URL(targetUrl).pathname);
  } catch {
    decodedPath = targetUrl;
  }
  const lowerPath = decodedPath.toLowerCase();
  const isDualAudio = lowerPath.includes('dual-audio') || lowerPath.includes('dual audio');
  const isImdbTop = lowerPath.includes('imdb') || lowerPath.includes('top-250') || lowerPath.includes('top 250');
  const is4k = lowerPath.includes('4k');

  const segments = decodedPath.split('/').filter(Boolean);
  const lastSeg = segments[segments.length - 1] || '';
  const yearSegMatch =
    lastSeg.match(/^[\(\[\s]*((?:19|20)\d{2})[\)\]\s]*$/) ||
    lastSeg.match(/^[\(\[\s]*((?:19|20)\d{2})[\)\]\s]*(?:and|&|-|\s)*before/i);

  const seenIds = new Set<string>();
  const combinedItems: ParsedFtpItem[] = [];
  const combinedSubs: ParsedFtpItem[] = [];

  const addItem = (item: ParsedFtpItem, overrides?: Partial<ParsedFtpItem>) => {
    const nextItem: ParsedFtpItem = overrides ? { ...item, ...overrides } : { ...item };
    if (seenIds.has(nextItem.id)) return;
    seenIds.add(nextItem.id);
    combinedItems.push(nextItem);
  };

  if (yearSegMatch) {
    const targetYear = parseInt(yearSegMatch[1], 10);
    const isBeforeEra = /before|1960|1995|2000/i.test(lastSeg) && targetYear <= 2000;
    const server2YearFolder = `https://server2.ftpbd.net/FTP-2/English%20Movies/${targetYear}/`;

    const sourcesToFetch: string[] = [
      'https://www.fradgify.kozow.com/media/movies/',
      server2YearFolder,
    ];
    if (isDualAudio) {
      sourcesToFetch.push('https://server2.ftpbd.net/FTP-2/English%20Movies/Dual-Audio/');
    }

    const results = await Promise.all(sourcesToFetch.map((u) => fetchCachedDirectory(u)));
    for (const res of results) {
      if (!res) continue;
      const isGlobalMovieList = res.url.includes('fradgify.kozow.com');
      for (const item of res.items) {
        if (item.mediaKind === 'year_folder' || item.mediaKind === 'category_folder') continue;
        if (isGlobalMovieList) {
          if (isBeforeEra) {
            if (!item.year || item.year > 2000) continue;
          } else if (item.year !== targetYear) {
            continue;
          }
        }
        addItem(item, {
          year: item.year || targetYear,
          audioTag: isDualAudio ? item.audioTag || 'Dual Audio' : item.audioTag,
        });
      }
      for (const sub of res.subtitles) {
        if (!seenIds.has(sub.id)) {
          seenIds.add(sub.id);
          combinedSubs.push(sub);
        }
      }
    }
  } else if (isImdbTop) {
    const [engRes, s2TopRes] = await Promise.all([
      fetchCachedDirectory('https://www.fradgify.kozow.com/media/movies/'),
      fetchCachedDirectory('https://server2.ftpbd.net/FTP-2/English%20Movies/IMDB-TOP-250/'),
    ]);
    let rank = 1;
    for (const res of [s2TopRes, engRes]) {
      if (!res) continue;
      for (const item of res.items) {
        if (item.mediaKind !== 'movie') continue;
        if (rank > 250) break;
        addItem(item, { rankNumber: rank++ });
      }
    }
  } else if (isDualAudio) {
    const [dualRoot, engRes] = await Promise.all([
      fetchCachedDirectory('https://server2.ftpbd.net/FTP-2/English%20Movies/Dual-Audio/'),
      fetchCachedDirectory('https://www.fradgify.kozow.com/media/movies/'),
    ]);

    for (const res of [dualRoot, engRes]) {
      if (!res) continue;
      for (const item of res.items) {
        if (item.mediaKind === 'year_folder' || item.mediaKind === 'category_folder') continue;
        addItem(item, {
          audioTag: item.audioTag || 'Dual Audio',
        });
      }
    }
  } else {
    // English Movies / 4K Movies / DhakaFlix English Movies
    const [s2Root, s24k, engRes] = await Promise.all([
      fetchCachedDirectory('https://server2.ftpbd.net/FTP-2/English%20Movies/'),
      fetchCachedDirectory('https://server2.ftpbd.net/FTP-2/English%20Movies/English-Movies-4K/'),
      fetchCachedDirectory('https://www.fradgify.kozow.com/media/movies/'),
    ]);

    const orderedSources = is4k ? [s24k, engRes, s2Root] : [s2Root, s24k, engRes];

    for (const res of orderedSources) {
      if (!res) continue;
      for (const item of res.items) {
        if (item.mediaKind === 'category_folder') continue;
        addItem(item);
      }
    }
  }

  return {
    url: normalizedBase,
    resolvedGatewayUrl: targetUrl,
    serverName,
    pageTitle: isImdbTop
      ? 'IMDb Top 250 Movies'
      : isDualAudio
      ? 'Dual Audio Movies (Hindi + English)'
      : 'English Movies',
    isH5ai: true,
    isPortalRoot: false,
    parentUrl,
    breadcrumbs,
    items: combinedItems,
    subtitles: combinedSubs,
    fetchedVia,
  };
}

/**
 * API: Browse any FTP / HTTP Open Directory URL
 */
app.get(['/api/browse', '/browse'], async (req, res) => {
  const rawUrl = String(req.query.url || '').trim();
  if (!rawUrl) {
    res.status(200).json({ error: 'Missing URL parameter' });
    return;
  }

  let normalizedUrl = rawUrl;
  if (!/^(https?|ftp):\/\//i.test(normalizedUrl)) {
    normalizedUrl = `http://${normalizedUrl}`;
  }

  try {
    const parsedUrl = new URL(normalizedUrl);
    const pathLastSeg = parsedUrl.pathname.split('/').filter(Boolean).pop() || '';
    const hasMediaFileExt = /\.(mp4|mkv|webm|avi|mov|ts|m4v|flv|wmv|m2ts|srt|vtt|sub|ass)$/i.test(pathLastSeg);
    if (hasMediaFileExt) {
      let decodedSeg = pathLastSeg;
      try {
        decodedSeg = decodeURIComponent(pathLastSeg);
      } catch {}
      const meta = extractMediaMetadata(decodedSeg, false);
      const isSubtitle = /\.(srt|vtt|ass|ssa|sub)$/i.test(decodedSeg);
      const singleItem: ParsedFtpItem = {
        id: normalizedUrl,
        rawName: decodedSeg,
        cleanTitle: meta.cleanTitle,
        url: normalizedUrl,
        isDirectory: false,
        mediaKind: meta.mediaKind,
        year: meta.year,
        season: meta.season,
        episode: meta.episode,
        quality: meta.quality,
        audioTag: meta.audioTag,
        codecTag: meta.codecTag,
        extension: meta.extension,
        sizeFormatted: '',
        lastModified: '',
      };
      const parentDir = normalizedUrl.replace(/\/[^\/]+\.[a-z0-9]+(\?.*)?$/i, '/');
      const { serverName, parentUrl, breadcrumbs } = buildBreadcrumbs(normalizedUrl);
      res.json({
        url: normalizedUrl,
        serverName,
        pageTitle: meta.cleanTitle,
        isH5ai: false,
        isPortalRoot: false,
        parentUrl: parentDir || parentUrl,
        breadcrumbs,
        items: isSubtitle ? [] : [singleItem],
        subtitles: isSubtitle ? [singleItem] : [],
        fetchedVia: 'backend',
      });
      return;
    }

    const isPrivateIp =
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(parsedUrl.hostname) ||
      /^10\./.test(parsedUrl.hostname) ||
      /^192\.168\./.test(parsedUrl.hostname);

    if (parsedUrl.protocol === 'ftp:') {
      const items = await browseNativeFtp(normalizedUrl);
      const { serverName, parentUrl, breadcrumbs } = buildBreadcrumbs(normalizedUrl);
      res.json({
        url: normalizedUrl,
        serverName,
        pageTitle: `FTP: ${serverName}`,
        isH5ai: false,
        isPortalRoot: parsedUrl.pathname === '/',
        parentUrl,
        breadcrumbs,
        items,
        subtitles: items.filter((i) => i.mediaKind === 'subtitle'),
        fetchedVia: 'backend',
      });
      return;
    }

    const gatewayUrl = resolvePublicBdixGatewayUrl(normalizedUrl);
    if (gatewayUrl === 'PORTAL_ROOT') {
      const portalHtml = buildBdixPortalRootHtml();
      const result = parseDirectoryHtml(portalHtml, normalizedUrl, 'bdix-cloud-gateway');
      result.pageTitle = 'DhakaFlix & BDIX Media Portal';
      res.json(result);
      return;
    }

    const effectiveTargetUrl = gatewayUrl || normalizedUrl;
    const effectiveVia: DirectoryBrowseResult['fetchedVia'] = gatewayUrl
      ? 'bdix-cloud-gateway'
      : 'backend';

    // Handle Today's Upload fallback if folder moved on server3
    if (/\/FTP-3\/.*today/i.test( decodeURIComponent(effectiveTargetUrl) )) {
      const fallbackToday = 'https://server3.ftpbd.net/FTP-3/Hindi%20Movies/2026/';
      const { text, finalUrl } = await fetchUrlText(fallbackToday, { timeoutMs: 8000 });
      const result = parseDirectoryHtml(text, finalUrl, effectiveVia);
      res.json(result);
      return;
    }

    // High-availability handling for server2.ftpbd.net (English Movies / Dual Audio / IMDb Top 250 / DhakaFlix LAN)
    if (effectiveTargetUrl.includes('server2.ftpbd.net')) {
      if (Date.now() > server2DownUntil) {
        try {
          const { text, finalUrl } = await fetchUrlText(effectiveTargetUrl, {
            timeoutMs: 8000,
          });
          const result = parseDirectoryHtml(text, finalUrl, effectiveVia);
          if (result.items.length > 0) {
            if (gatewayUrl) result.resolvedGatewayUrl = finalUrl;
            res.json(result);
            return;
          }
        } catch {
          server2DownUntil = Date.now() + 20 * 1000;
        }
      }

      const fallbackResult = await buildServer2MirrorResult(
        effectiveTargetUrl,
        normalizedUrl,
        effectiveVia
      );
      if (fallbackResult.items.length > 0) {
        res.json(fallbackResult);
        return;
      }
    }

    const { text, finalUrl } = await fetchUrlText(effectiveTargetUrl, {
      timeoutMs: isPrivateIp && !gatewayUrl ? (process.env.CINEFTP_DIRECT_LAN === '1' ? 15000 : 2000) : 9000,
    });
    const result = parseDirectoryHtml(text, finalUrl, effectiveVia);
    if (gatewayUrl) {
      result.resolvedGatewayUrl = finalUrl;
    }

    if (result.isH5ai && result.items.length === 0) {
      const h5Items = await tryH5aiJsonFetch(finalUrl);
      if (h5Items.length > 0) {
        result.items = h5Items;
      }
    }

    if (result.items.length > 0) {
      res.json(result);
      return;
    }

    res.status(200).json({
      error: 'No media items found at this URL.',
      targetUrl: normalizedUrl,
    });
  } catch (err: any) {
    res.status(200).json({
      error: err?.message || 'Failed to connect to server',
      targetUrl: normalizedUrl,
    });
  }
});

/**
 * API: Real Movie & Series Metadata Enricher (IMDb Suggestion API + Apple iTunes + TVMaze)
 */
app.get(['/api/metadata', '/metadata'], async (req, res) => {
  const title = String(req.query.title || '').trim();
  const year = req.query.year ? parseInt(String(req.query.year), 10) : undefined;
  const kind = String(req.query.kind || 'movie');

  if (!title || title.length < 2) {
    res.json({ found: false });
    return;
  }

  const cacheKey = `${title.toLowerCase()}|${year || ''}|${kind}`;
  if (metadataCache.has(cacheKey)) {
    res.json(metadataCache.get(cacheKey));
    return;
  }

  try {
    const cleanQuery = title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const firstChar = cleanQuery[0] || 'a';
    const imdbSlug = encodeURIComponent(cleanQuery.slice(0, 40));
    const isSeriesKind = kind === 'series' || kind === 'episode';
    const TIMEOUT = 7000;

    const getJson = async (url: string, headers?: Record<string, string>): Promise<any | null> => {
      try {
        const r = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT) });
        return r.ok ? await r.json() : null;
      } catch {
        return null;
      }
    };

    // IMDb, TVMaze and iTunes are asked AT THE SAME TIME (they used to run one after another)
    const [imdbData, tvData, itunesData] = await Promise.all([
      getJson(`https://v3.sg.media-imdb.com/suggestion/${firstChar}/${imdbSlug}.json`, {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
      }),
      isSeriesKind
        ? getJson(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(title)}`)
        : Promise.resolve(null),
      getJson(
        `https://itunes.apple.com/search?term=${encodeURIComponent(year ? `${title} ${year}` : title)}&entity=${
          kind === 'series' ? 'tvSeason' : 'movie'
        }&limit=3`
      ),
    ]);

    let posterUrl: string | undefined;
    let backdropUrl: string | undefined;
    let imdbId: string | undefined;
    let imdbRating: string | undefined;
    let resolvedYear: number | undefined = year;
    let cast: string | undefined;
    let genres: string[] = [];
    let plot: string | undefined;
    let runtime: string | undefined;

    if (imdbData) {
      const candidates: any[] = Array.isArray(imdbData?.d) ? imdbData.d : [];
      let best = candidates.find(
        (c) => c.i?.imageUrl && year && c.y && Math.abs(Number(c.y) - year) <= 1
      );
      if (!best) {
        best = candidates.find(
          (c) =>
            c.i?.imageUrl &&
            (c.qid === 'movie' || c.qid === 'tvSeries' || c.qid === 'tvMiniSeries' || c.q)
        );
      }
      if (!best && candidates.length > 0) best = candidates[0];

      if (best) {
        imdbId = best.id;
        if (best.y && !resolvedYear) resolvedYear = Number(best.y);
        if (best.s) cast = String(best.s);
        if (best.i?.imageUrl) {
          posterUrl = String(best.i.imageUrl).replace(/\._V1_.*\.jpg$/i, '._V1_SX600.jpg');
        }
      }
    }

    if (tvData) {
      if (!posterUrl && tvData.image?.original) posterUrl = tvData.image.original;
      if (tvData.rating?.average) imdbRating = String(tvData.rating.average);
      if (Array.isArray(tvData.genres)) genres = tvData.genres.slice(0, 3);
      if (tvData.summary) plot = String(tvData.summary).replace(/<[^>]+>/g, '').trim();
      if (tvData.premiered && !resolvedYear) {
        resolvedYear = parseInt(String(tvData.premiered).slice(0, 4), 10);
      }
    }

    if (itunesData) {
      const results: any[] = Array.isArray(itunesData?.results) ? itunesData.results : [];
      const match =
        results.find(
          (r) =>
            year &&
            r.releaseDate &&
            Math.abs(parseInt(String(r.releaseDate).slice(0, 4), 10) - year) <= 1
        ) || results[0];

      if (match) {
        if (!posterUrl && match.artworkUrl100) {
          posterUrl = String(match.artworkUrl100).replace('100x100bb', '600x900bb');
        }
        if (match.artworkUrl100) {
          backdropUrl = String(match.artworkUrl100).replace('100x100bb', '1200x675bb');
        }
        if (!plot && (match.longDescription || match.shortDescription)) {
          plot = match.longDescription || match.shortDescription;
        }
        if (genres.length === 0 && match.primaryGenreName) genres = [match.primaryGenreName];
        if (match.trackTimeMillis) {
          const mins = Math.round(Number(match.trackTimeMillis) / 60000);
          if (mins > 0) runtime = `${mins} min`;
        }
      }
    }


    // Last resort when IMDb/iTunes found no picture: shorter title on IMDb + Wikipedia page image
    if (!posterUrl) {
      const shortTitle = title.split(/\s[-:\u2013]\s|:/)[0].trim();
      const q2 = (shortTitle.length >= 2 ? shortTitle : title)
        .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      const [imdb2, wiki] = await Promise.all([
        q2 && q2 !== cleanQuery
          ? getJson(`https://v3.sg.media-imdb.com/suggestion/${q2[0]}/${encodeURIComponent(q2.slice(0, 40))}.json`, {
              'User-Agent': 'Mozilla/5.0',
              Accept: 'application/json',
            })
          : Promise.resolve(null),
        getJson(
          `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=1&prop=pageimages|extracts&piprop=thumbnail&pithumbsize=500&exintro=1&explaintext=1&exsentences=3&gsrsearch=${encodeURIComponent(
            `${title} ${year || ''} ${isSeriesKind ? 'television series' : 'film'}`
          )}`
        ),
      ]);
      const c2 = (Array.isArray(imdb2?.d) ? imdb2.d : []).find((c: any) => c.i?.imageUrl);
      if (c2) {
        imdbId = imdbId || c2.id;
        if (c2.y && !resolvedYear) resolvedYear = Number(c2.y);
        if (c2.s && !cast) cast = String(c2.s);
        posterUrl = String(c2.i.imageUrl).replace(/\._V1_.*\.jpg$/i, '._V1_SX600.jpg');
      }
      const wikiPage: any = wiki?.query?.pages ? Object.values(wiki.query.pages)[0] : null;
      const firstWord = q2.split(' ')[0] || '';
      if (wikiPage && firstWord && String(wikiPage.title || '').toLowerCase().includes(firstWord)) {
        if (!posterUrl && wikiPage.thumbnail?.source) posterUrl = wikiPage.thumbnail.source;
        if (!plot && wikiPage.extract) plot = String(wikiPage.extract).trim();
      }
    }
    const payload = {
      found: Boolean(posterUrl || plot || cast),
      posterUrl,
      backdropUrl: backdropUrl || posterUrl,
      imdbId,
      imdbRating,
      year: resolvedYear,
      cast,
      genres,
      plot,
      runtime,
    };

    // Do not remember a total miss (network hiccup): it would stay blank until restart
    if (payload.found) metadataCache.set(cacheKey, payload);
    res.json(payload);
  } catch {
    res.json({ found: false });
  }
});

/**
 * Helper to check if a movie on server2.ftpbd.net has a companion Hindi Dubbed or English stream
 * in the sister Dual-Audio / English folder
 */
async function findCompanionLanguageStream(
  videoUrl: string
): Promise<{ label: string; url: string; lang: string } | null> {
  try {
    const u = new URL(videoUrl);
    if (!u.pathname.includes('/FTP-2/English%20Movies/')) return null;

    let companionFolderUrl = '';
    let targetLabel = '';
    let targetLang = '';

    const engMatch = u.pathname.match(
      /^\/FTP-2\/English%20Movies\/((?:19|20)\d{2})\/([^\/]+)\//
    );
    if (engMatch) {
      companionFolderUrl = `${u.protocol}//${u.host}/FTP-2/English%20Movies/Dual-Audio/${engMatch[1]}/${engMatch[2]}/`;
      targetLabel = 'Hindi Dubbed · [Dual Audio Stream]';
      targetLang = 'hin';
    }

    const dualMatch = u.pathname.match(
      /^\/FTP-2\/English%20Movies\/Dual-Audio\/((?:19|20)\d{2})\/([^\/]+)\//
    );
    if (dualMatch) {
      companionFolderUrl = `${u.protocol}//${u.host}/FTP-2/English%20Movies/${dualMatch[1]}/${dualMatch[2]}/`;
      targetLabel = 'English · [Original Audio Stream]';
      targetLang = 'eng';
    }

    if (!companionFolderUrl) return null;

    const { text, status } = await fetchUrlText(companionFolderUrl, { timeoutMs: 3500 });
    if (status !== 200) return null;
    const parsed = parseDirectoryHtml(text, companionFolderUrl, 'backend');
    const companionVid = parsed.items.find(
      (i) => !i.isDirectory && (i.mediaKind === 'movie' || i.mediaKind === 'episode')
    );
    if (companionVid) {
      return {
        label: targetLabel,
        url: companionVid.url,
        lang: targetLang,
      };
    }
    return null;
  } catch {
    return null;
  }
}

const sharedHttpsAgent = new https.Agent({
  keepAlive: true,
  rejectUnauthorized: false,
  timeout: 30000,
});

const sharedHttpAgent = new http.Agent({
  keepAlive: true,
  timeout: 30000,
});

const isVercelRuntime = Boolean(process.env.VERCEL || process.env.NOW_REGION);

/**
 * Shared HTTP Range Stream Proxy Handler with Multi-Mirror Bypass
 * Fast sub-second startup: Clamps open-ended Range requests to 4.0 MB chunks
 * so browsers receive 206 Partial Content instantly (~200ms) without stalling or buffering multi-GB files.
 * Works seamlessly on Vercel Serverless, Google Cloud Run, and Node.js dev server.
 * Automatically tries alternative FTP mirrors (server2, server3, server4, server5) if one returns 404 or times out.
 */
async function handleRangeStreamProxy(
  req: express.Request,
  res: express.Response,
  videoUrl: string
) {
  let targetUrl = videoUrl;
  const gatewayResolved = resolvePublicBdixGatewayUrl(videoUrl);
  if (gatewayResolved && gatewayResolved !== 'PORTAL_ROOT') {
    targetUrl = gatewayResolved;
  }

  // Upgrade known public FTP mirrors to HTTPS to prevent mixed content issues
  if (targetUrl.startsWith('http://server') && targetUrl.includes('.ftpbd.net')) {
    targetUrl = targetUrl.replace(/^http:\/\//i, 'https://');
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    res.status(400).send('Invalid URL');
    return;
  }

  const rawRange = req.headers.range;
  const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB chunk: fast 200ms startup, works universally on Vercel & Node.js
  let rangeToSend: string | undefined;

  const isBypass = req.query.bypass === '1' || req.query.engine === 'bypass';
  if (rawRange) {
    if (isBypass) {
      rangeToSend = rawRange;
    } else {
      const match = rawRange.match(/^bytes=(\d+)-(\d*)$/);
      if (match) {
        const start = parseInt(match[1], 10) || 0;
        const requestedEnd = match[2] ? parseInt(match[2], 10) : NaN;
        if (!isNaN(requestedEnd) && requestedEnd >= start) {
          // Client specified explicit range end: cap to max 8 MB to prevent socket saturation
          const end = Math.min(requestedEnd, start + 8 * 1024 * 1024 - 1);
          rangeToSend = `bytes=${start}-${end}`;
        } else {
          // Open-ended range (bytes=N-): clamp to 4MB chunk so upstream responds in ~150ms
          rangeToSend = `bytes=${start}-${start + CHUNK_SIZE - 1}`;
        }
      } else {
        rangeToSend = rawRange;
      }
    }
  } else {
    // No range header provided: request initial 4 MB slice or open stream for bypass
    rangeToSend = isBypass ? undefined : `bytes=0-${CHUNK_SIZE - 1}`;
  }

  const upstreamHeaders: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    Accept: '*/*',
  };
  if (rangeToSend) {
    upstreamHeaders['Range'] = rangeToSend;
  }

  // Generate mirror URL candidates across server cluster
  const mirrorCandidates: string[] = [targetUrl];
  if (targetUrl.includes('server3.ftpbd.net')) {
    mirrorCandidates.push(targetUrl.replace('server3.ftpbd.net', 'server2.ftpbd.net'));
    mirrorCandidates.push(targetUrl.replace('server3.ftpbd.net', 'server5.ftpbd.net'));
    mirrorCandidates.push(targetUrl.replace('server3.ftpbd.net', 'server4.ftpbd.net'));
  } else if (targetUrl.includes('server2.ftpbd.net')) {
    mirrorCandidates.push(targetUrl.replace('server2.ftpbd.net', 'server3.ftpbd.net'));
    mirrorCandidates.push(targetUrl.replace('server2.ftpbd.net', 'server5.ftpbd.net'));
    mirrorCandidates.push(targetUrl.replace('server2.ftpbd.net', 'server4.ftpbd.net'));
  } else if (targetUrl.includes('server4.ftpbd.net')) {
    mirrorCandidates.push(targetUrl.replace('server4.ftpbd.net', 'server3.ftpbd.net'));
    mirrorCandidates.push(targetUrl.replace('server4.ftpbd.net', 'server2.ftpbd.net'));
  } else if (targetUrl.includes('server5.ftpbd.net')) {
    mirrorCandidates.push(targetUrl.replace('server5.ftpbd.net', 'server2.ftpbd.net'));
    mirrorCandidates.push(targetUrl.replace('server5.ftpbd.net', 'server3.ftpbd.net'));
  }

  let mirrorIdx = 0;

  const tryNextMirrorOrEnd = (statusCode: number, errMsg: string) => {
    mirrorIdx++;
    if (mirrorIdx < mirrorCandidates.length) {
      try {
        const nextUrl = new URL(mirrorCandidates[mirrorIdx]);
        makeProxyRequest(nextUrl, 0);
        return;
      } catch {}
    }

    if (!res.headersSent) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      res.status(statusCode).json({ error: errMsg, targetUrl });
    }
  };

  const makeProxyRequest = (requestUrl: URL, redirectCount = 0) => {
    if (redirectCount > 4) {
      tryNextMirrorOrEnd(502, 'Too many redirects');
      return;
    }

    const currentClient = requestUrl.protocol === 'https:' ? https : http;
    const currentAgent = requestUrl.protocol === 'https:' ? sharedHttpsAgent : sharedHttpAgent;

    const upstreamReq = currentClient.request(
      requestUrl.href,
      {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: upstreamHeaders,
        agent: currentAgent,
        timeout: isVercelRuntime ? 14000 : 30000,
      },
      async (upstreamRes) => {
        // Handle HTTP 301/302/307/308 redirects
        const statusCode = upstreamRes.statusCode || 200;
        if (
          [301, 302, 303, 307, 308].includes(statusCode) &&
          upstreamRes.headers.location
        ) {
          try {
            const redirectUrl = new URL(upstreamRes.headers.location, requestUrl.href);
            makeProxyRequest(redirectUrl, redirectCount + 1);
            return;
          } catch {}
        }

        // On upstream 404/5xx, try alternative mirror before failing
        if (statusCode >= 400) {
          try {
            upstreamReq.destroy();
          } catch {}
          tryNextMirrorOrEnd(statusCode, `Upstream stream returned HTTP ${statusCode}`);
          return;
        }

        const ext = requestUrl.pathname.split('.').pop()?.toLowerCase() || '';
        let contentType = upstreamRes.headers['content-type'] || '';

        // If upstream responded with an HTML page or directory listing, auto-resolve video inside folder (up to 2 levels deep)
        if (contentType.includes('text/html') && !VIDEO_EXTENSIONS.has(ext)) {
          try {
            upstreamReq.destroy();
          } catch {}

          try {
            const browseRes = await fetchUrlText(requestUrl.href, { timeoutMs: 8000 });
            const parsedDir = parseDirectoryHtml(browseRes.text, browseRes.finalUrl);
            let foundVid = parsedDir.items.find(
              (i) =>
                !i.isDirectory &&
                (i.mediaKind === 'movie' ||
                  i.mediaKind === 'episode' ||
                  (i.extension && VIDEO_EXTENSIONS.has(i.extension)))
            );

            // If not found in root, crawl subfolders (e.g. Season-1, Season 1, 1080p, etc.)
            if (!foundVid) {
              const subFolders = parsedDir.items.filter(
                (i) =>
                  i.isDirectory &&
                  !/^(subs?|subtitles?|sample|extras?)$/i.test(i.rawName.trim())
              );
              for (const sf of subFolders.slice(0, 4)) {
                try {
                  const sfRes = await fetchUrlText(sf.url, { timeoutMs: 7000 });
                  const sfParsed = parseDirectoryHtml(sfRes.text, sfRes.finalUrl);
                  const sfVid = sfParsed.items.find(
                    (i) =>
                      !i.isDirectory &&
                      (i.mediaKind === 'movie' ||
                        i.mediaKind === 'episode' ||
                        (i.extension && VIDEO_EXTENSIONS.has(i.extension)))
                  );
                  if (sfVid) {
                    foundVid = sfVid;
                    break;
                  }
                } catch {}
              }
            }

            if (foundVid) {
              makeProxyRequest(new URL(foundVid.url), redirectCount + 1);
              return;
            }
          } catch {}

          tryNextMirrorOrEnd(400, 'Cannot stream folder or HTML index page as video media.');
          return;
        }

        if (!contentType || contentType === 'application/octet-stream' || contentType.includes('text/html')) {
          if (ext === 'mp4' || ext === 'm4v') contentType = 'video/mp4';
          else if (ext === 'mkv') contentType = 'video/mp4';
          else if (ext === 'webm') contentType = 'video/webm';
          else if (ext === 'ts') contentType = 'video/mp2t';
          else contentType = 'video/mp4';
        }

        res.status(statusCode);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');
        res.setHeader(
          'Access-Control-Expose-Headers',
          'Content-Range, Content-Length, Accept-Ranges, Content-Type'
        );
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400');

        const upstreamContentRange = upstreamRes.headers['content-range'];
        const upstreamContentLength = upstreamRes.headers['content-length'];
        if (upstreamContentRange) res.setHeader('Content-Range', upstreamContentRange);
        if (upstreamContentLength) res.setHeader('Content-Length', upstreamContentLength);

        if (req.method === 'HEAD') {
          res.end();
          try {
            upstreamReq.destroy();
          } catch {}
          return;
        }

        upstreamRes.pipe(res);

        req.on('close', () => {
          try {
            upstreamReq.destroy();
          } catch {}
        });
      }
    );

    upstreamReq.on('timeout', () => {
      try {
        upstreamReq.destroy();
      } catch {}
      tryNextMirrorOrEnd(504, 'Stream upstream connection timeout');
    });

    upstreamReq.on('error', (err: any) => {
      try {
        upstreamReq.destroy();
      } catch {}
      tryNextMirrorOrEnd(502, err?.message || 'Stream connection error');
    });

    upstreamReq.end();
  };

  makeProxyRequest(parsed);
}

/**
 * API: Probe Video File using ffprobe (with graceful Vercel fallback when ffprobe is not installed)
 */
app.get(['/api/probe', '/probe'], async (req, res) => {
  const videoUrl = String(req.query.url || '').trim();
  if (!videoUrl) {
    res.status(200).json({ error: 'Missing url parameter' });
    return;
  }

  const targetUrl = videoUrl;

  const companionPromise = findCompanionLanguageStream(targetUrl);

  // If running on Vercel Serverless where ffprobe binary is not installed, return companion stream & default tracks cleanly
  if (!HAS_FFPROBE) {
    const companion = await companionPromise;
    const defaultLabel = /hindi/i.test(targetUrl)
      ? 'Hindi · [Primary Stream]'
      : 'English · [Primary Stream]';
    const fallbackTracks: any[] = [
      {
        audioIndex: 0,
        streamIndex: 1,
        codec: 'aac',
        language: /hindi/i.test(targetUrl) ? 'hin' : 'eng',
        label: defaultLabel,
        channels: 2,
        isBrowserNative: true,
      },
    ];
    if (companion) {
      fallbackTracks.push({
        audioIndex: 99,
        streamIndex: 99,
        codec: 'aac',
        language: companion.lang,
        label: companion.label,
        channels: 2,
        isBrowserNative: true,
        companionUrl: companion.url,
      });
    }
    res.status(200).json({
      duration: 0,
      video: null,
      audioTracks: fallbackTracks,
      subtitleTracks: [],
      ffmpegAvailable: HAS_FFMPEG,
    });
    return;
  }

  const args = [
    '-v',
    'quiet',
    '-tls_verify',
    '0',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    '-user_agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    targetUrl,
  ];

  const proc = spawn('ffprobe', args);
  let stdout = '';
  let responded = false;

  const timer = setTimeout(() => {
    try {
      proc.kill('SIGKILL');
    } catch {}
  }, 10000);

  proc.stdout.on('data', (d) => {
    stdout += d.toString();
  });

  proc.on('error', async () => {
    clearTimeout(timer);
    if (responded) return;
    responded = true;
    const companion = await companionPromise;
    res.status(200).json({
      duration: 0,
      video: null,
      audioTracks: companion
        ? [
            {
              audioIndex: 0,
              streamIndex: 1,
              codec: 'aac',
              language: 'und',
              label: 'Primary Audio',
              channels: 2,
              isBrowserNative: true,
            },
            {
              audioIndex: 99,
              streamIndex: 99,
              codec: 'aac',
              language: companion.lang,
              label: companion.label,
              channels: 2,
              isBrowserNative: true,
              companionUrl: companion.url,
            },
          ]
        : [],
      subtitleTracks: [],
      ffmpegAvailable: false,
    });
  });

  proc.on('close', async (code) => {
    clearTimeout(timer);
    if (responded) return;
    responded = true;
    const companion = await companionPromise;

    if (code !== 0 || !stdout) {
      res.status(200).json({
        duration: 0,
        video: null,
        audioTracks: [],
        subtitleTracks: [],
        companionStream: companion,
        ffmpegAvailable: HAS_FFMPEG,
      });
      return;
    }

    try {
      const parsed = JSON.parse(stdout);
      const streams: any[] = Array.isArray(parsed.streams) ? parsed.streams : [];
      const duration = parsed.format?.duration ? parseFloat(parsed.format.duration) : 0;

      const audioStreams = streams.filter((s) => s.codec_type === 'audio');
      const subtitleStreams = streams.filter((s) => s.codec_type === 'subtitle');
      const videoStream = streams.find((s) => s.codec_type === 'video');

      const langNames: Record<string, string> = {
        eng: 'English',
        hin: 'Hindi',
        ben: 'Bengali',
        tam: 'Tamil',
        tel: 'Telugu',
        mal: 'Malayalam',
        kan: 'Kannada',
        jpn: 'Japanese',
        kor: 'Korean',
        spa: 'Spanish',
        fre: 'French',
        fra: 'French',
        ger: 'German',
        deu: 'German',
        rus: 'Russian',
        chi: 'Chinese',
        zho: 'Chinese',
        ara: 'Arabic',
        tur: 'Turkish',
        urd: 'Urdu',
      };

      const audioTracks = audioStreams.map((s, idx) => {
        const lang = s.tags?.language || s.tags?.LANGUAGE || 'und';
        const title = s.tags?.title || s.tags?.TITLE || '';
        const codec = (s.codec_name || 'audio').toUpperCase();
        const channels = s.channels
          ? `${s.channels === 6 ? '5.1' : s.channels === 8 ? '7.1' : `${s.channels}.0`}ch`
          : '';
        const readableLang =
          langNames[lang.toLowerCase()] ||
          (/hindi/i.test(videoUrl) ? 'Hindi' : /english/i.test(videoUrl) ? 'English' : `Audio Track ${idx + 1}`);
        const labelParts = [readableLang];
        if (title && !title.toLowerCase().includes(readableLang.toLowerCase())) {
          labelParts.push(title);
        }

        const chCount = Number(s.channels || 2);
        const codecLower = String(s.codec_name || '').toLowerCase();
        const isBrowserNative =
          ['aac', 'mp3', 'opus', 'vorbis', 'flac'].includes(codecLower) && chCount <= 2;

        return {
          audioIndex: idx,
          streamIndex: s.index,
          codec: s.codec_name || 'unknown',
          language: lang,
          label: labelParts.join(' — '),
          channels: chCount,
          isBrowserNative,
        };
      });

      if (companion) {
        audioTracks.push({
          audioIndex: 99,
          streamIndex: 99,
          codec: 'aac',
          language: companion.lang,
          label: companion.lang === 'hin' ? 'Hindi (Dual Audio)' : 'English (Original Audio)',
          channels: 2,
          isBrowserNative: true,
          companionUrl: companion.url,
        } as any);
      }

      const subtitleTracks = subtitleStreams.map((s, idx) => {
        const lang = s.tags?.language || s.tags?.LANGUAGE || 'und';
        const title = s.tags?.title || s.tags?.TITLE || '';
        return {
          subIndex: idx,
          streamIndex: s.index,
          codec: s.codec_name || 'subrip',
          language: lang,
          label: `${lang.toUpperCase()}${title ? ` — ${title}` : ` Subtitle #${idx + 1}`}`,
        };
      });

      const is10BitOrHevc = Boolean(
        videoStream &&
          (String(videoStream.codec_name || '').toLowerCase() !== 'h264' ||
            String(videoStream.pix_fmt || '').includes('10') ||
            String(videoStream.profile || '').includes('10'))
      );

      res.json({
        duration,
        video: videoStream
          ? {
              codec: videoStream.codec_name,
              profile: videoStream.profile,
              pixFmt: videoStream.pix_fmt,
              width: videoStream.width,
              height: videoStream.height,
              needsVideoTranscode: is10BitOrHevc,
            }
          : null,
        audioTracks,
        subtitleTracks,
        ffmpegAvailable: HAS_FFMPEG,
      });
    } catch {
      res.status(200).json({
        duration: 0,
        video: null,
        audioTracks: [],
        subtitleTracks: [],
        ffmpegAvailable: HAS_FFMPEG,
      });
    }
  });
});

/**
 * API: Direct HTTP Range Stream Proxy
 */
app.all(['/api/stream', '/stream'], (req, res) => {
  const videoUrl = String(req.query.url || '').trim();
  if (!videoUrl) {
    res.status(400).send('Missing url parameter');
    return;
  }
  handleRangeStreamProxy(req, res, videoUrl);
});

/**
 * API: Real-Time FFmpeg Multi-Audio Track Switcher & MKV/10-bit-to-MP4 Stream Remuxer
 * Automatically falls back to HTTP Range Stream Proxy on Vercel Serverless if ffmpeg is not installed.
 */
app.get(['/api/transcode', '/transcode'], (req, res) => {
  const videoUrl = String(req.query.url || '').trim();
  const audioTrack = Math.max(0, parseInt(String(req.query.audioTrack || '0'), 10) || 0);
  const startSeconds = Math.max(0, parseFloat(String(req.query.start || '0')) || 0);
  const is10BitOrHevcName = /\b(10bit|10-bit|hevc|x265|h\.?265)\b/i.test(videoUrl);
  const reencodeVideo = req.query.reencode === '1' || is10BitOrHevcName;

  if (!videoUrl) {
    res.status(400).send('Missing url parameter');
    return;
  }

  const targetUrl = videoUrl;

  // On Vercel Serverless (where ffmpeg binary is absent), fall back seamlessly to Range Stream Proxy
  if (!HAS_FFMPEG) {
    handleRangeStreamProxy(req, res, targetUrl);
    return;
  }

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  const buildArgs = (reencode: boolean): string[] => {
    const ffmpegArgs: string[] = ['-hide_banner', '-loglevel', 'error', ...tlsOpts(targetUrl)];

    if (startSeconds > 0) {
      ffmpegArgs.push('-ss', String(startSeconds));
    }

    ffmpegArgs.push(
      '-user_agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      '-i',
      targetUrl,
      '-map',
      '0:v:0',
      '-map',
      `0:a:${audioTrack}?`
    );

    if (reencode) {
      ffmpegArgs.push(
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-preset',
        'ultrafast',
        '-crf',
        '24',
        '-g',
        '48',
        '-vf',
        'scale=trunc(iw/2)*2:trunc(ih/2)*2'
      );
    } else {
      ffmpegArgs.push('-c:v', 'copy');
    }

    ffmpegArgs.push(
      '-c:a',
      'aac',
      '-ac',
      '2',
      '-b:a',
      '256k',
      '-ar',
      '48000',
      '-af',
      'volume=1.6,acompressor=threshold=-20dB:ratio=3:attack=10:release=150:makeup=4dB,alimiter=limit=0.98',
      '-sn',
      '-f',
      'mp4',
      '-movflags',
      'frag_keyframe+empty_moov+default_base_moof',
      'pipe:1'
    );
    return ffmpegArgs;
  };

  let bytesOut = 0;
  let clientGone = false;
  let currentProc: ReturnType<typeof spawn> | null = null;

  const runFfmpeg = (reencode: boolean) => {
    const proc = spawn('ffmpeg', buildArgs(reencode));
    currentProc = proc;
    let errText = '';

    proc.stderr?.on('data', (d) => {
      errText = (errText + d.toString()).slice(-1500);
    });
    proc.stdout.on('data', (chunk) => {
      bytesOut += chunk.length;
    });
    // end:false -> we may start a second (re-encode) attempt on the same response
    proc.stdout.pipe(res, { end: false });

    proc.on('error', () => {
      if (!res.headersSent) {
        res.status(200).end();
      } else {
        res.end();
      }
    });

    proc.on('close', (code) => {
      if (clientGone) return;
      // Copy-mode failed before sending anything (unsupported codec, odd container...) -> retry once with re-encode
      if (code !== 0 && bytesOut === 0 && !reencode) {
        console.warn('[transcode] copy mode failed, retrying with re-encode:', errText.trim().slice(-300));
        runFfmpeg(true);
        return;
      }
      if (code !== 0 && bytesOut === 0) {
        console.warn('[transcode] ffmpeg failed:', errText.trim().slice(-500));
      }
      res.end();
    });
  };

  runFfmpeg(reencodeVideo);

  req.on('close', () => {
    clientGone = true;
    try {
      currentProc?.kill('SIGKILL');
    } catch {}
  });
});

/**
 * API: Quick ffmpeg check of a video URL (used by the desktop player to show WHY a stream failed)
 */
app.get(['/api/diag', '/diag'], (req, res) => {
  const videoUrl = String(req.query.url || '').trim();
  if (!videoUrl) {
    res.json({ ok: false, error: 'Missing url parameter' });
    return;
  }
  if (!HAS_FFMPEG) {
    res.json({ ok: false, error: 'ffmpeg is not available in this app build' });
    return;
  }
  const proc = spawn('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    ...tlsOpts(videoUrl),
    '-user_agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    '-i',
    videoUrl,
    '-map',
    '0:v:0',
    '-t',
    '2',
    '-f',
    'null',
    '-',
  ]);
  let err = '';
  let done = false;
  const finish = (payload: Record<string, unknown>) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    res.json(payload);
  };
  const timer = setTimeout(() => {
    try {
      proc.kill('SIGKILL');
    } catch {}
    finish({ ok: false, error: 'Timed out (25s) while opening the file: the server is too slow or not reachable from this PC.' });
  }, 25000);
  proc.stderr?.on('data', (d) => {
    err = (err + d.toString()).slice(-700);
  });
  proc.on('error', (e) => finish({ ok: false, error: `ffmpeg could not start: ${e.message}` }));
  proc.on('close', (code) => finish({ ok: code === 0, error: code === 0 ? '' : err.trim() || `ffmpeg exited with code ${code}` }));
});

/**
 * API: Fetch and convert external .srt / .vtt subtitle file to WebVTT
 */
app.get(['/api/subtitle', '/subtitle'], async (req, res) => {
  const subUrl = String(req.query.url || '').trim();
  const offset = parseFloat(String(req.query.offset || '0')) || 0;
  if (!subUrl) {
    res.status(400).send('Missing subtitle URL');
    return;
  }

  try {
    const { text } = await fetchUrlText(subUrl, { timeoutMs: 8000 });
    const vtt = convertSrtToVtt(text, offset);
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.send(vtt);
  } catch {
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.send(`WEBVTT\n\n`);
  }
});

/**
 * API: Extract embedded subtitle track from MKV/MP4 via FFmpeg into WebVTT
 */
app.get(['/api/embedded-subtitle', '/embedded-subtitle'], (req, res) => {
  const videoUrl = String(req.query.url || '').trim();
  const subIndex = Math.max(0, parseInt(String(req.query.subIndex || '0'), 10) || 0);
  const startSeconds = Math.max(0, parseFloat(String(req.query.start || '0')) || 0);

  if (!videoUrl || !HAS_FFMPEG) {
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.send(`WEBVTT\n\n`);
    return;
  }

  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');

  const targetUrl = videoUrl;

  const args: string[] = ['-hide_banner', '-loglevel', 'error', ...tlsOpts(targetUrl)];
  if (startSeconds > 0) {
    args.push('-ss', String(startSeconds));
  }
  args.push('-i', targetUrl, '-map', `0:s:${subIndex}`, '-f', 'webvtt', 'pipe:1');

  const proc = spawn('ffmpeg', args);
  proc.stdout.pipe(res);

  proc.on('error', () => {
    if (!res.headersSent) {
      res.send(`WEBVTT\n\n`);
    }
  });

  req.on('close', () => {
    try {
      proc.kill('SIGKILL');
    } catch {}
  });
});

/**
 * API: Download 1-Click Local BDIX Network Bridge Script for Windows (.bat)
 */
app.get(['/api/bdix-bridge.bat', '/bdix-bridge.bat'], (_req, res) => {
  const nodeScript = `
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { spawn } = require('child_process');

const PORT = 7788;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, 'http://127.0.0.1:' + PORT);

  if (reqUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', bridge: 'CineFTP-BDIX-Bridge', port: PORT }));
    return;
  }

  if (reqUrl.pathname === '/raw') {
    const target = reqUrl.searchParams.get('url');
    if (!target) { res.writeHead(400); res.end('Missing url'); return; }
    try {
      const r = await fetch(target, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      const html = await r.text();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ html, finalUrl: r.url || target, status: r.status }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (reqUrl.pathname === '/stream') {
    const target = reqUrl.searchParams.get('url');
    if (!target) { res.writeHead(400); res.end('Missing url'); return; }
    let parsed;
    try { parsed = new URL(target); } catch { res.writeHead(400); res.end('Bad url'); return; }
    const client = parsed.protocol === 'https:' ? https : http;
    const headers = { 'User-Agent': 'Mozilla/5.0' };
    if (req.headers.range) headers['Range'] = req.headers.range;
    const pReq = client.request(target, { method: 'GET', headers }, (pRes) => {
      if ([301,302,303,307,308].includes(pRes.statusCode) && pRes.headers.location) {
        const redir = new URL(pRes.headers.location, target).href;
        res.writeHead(302, { Location: '/stream?url=' + encodeURIComponent(redir) });
        res.end();
        return;
      }
      const outHeaders = {};
      ['content-length','content-range','accept-ranges','content-type'].forEach(k => {
        if (pRes.headers[k]) outHeaders[k] = pRes.headers[k];
      });
      res.writeHead(pRes.statusCode || 200, outHeaders);
      pRes.pipe(res);
    });
    pReq.on('error', (e) => { if (!res.headersSent) { res.writeHead(502); res.end(e.message); } });
    req.on('close', () => pReq.destroy());
    pReq.end();
    return;
  }

  if (reqUrl.pathname === '/transcode') {
    const target = reqUrl.searchParams.get('url');
    const audioTrack = parseInt(reqUrl.searchParams.get('audioTrack') || '0', 10) || 0;
    const start = parseFloat(reqUrl.searchParams.get('start') || '0') || 0;
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store' });
    const args = ['-hide_banner', '-loglevel', 'error'];
    if (start > 0) args.push('-ss', String(start));
    args.push('-i', target, '-map', '0:v:0', '-map', '0:a:' + audioTrack + '?', '-c:v', 'copy', '-c:a', 'aac', '-ac', '2', '-b:a', '192k', '-sn', '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1');
    const proc = spawn('ffmpeg', args);
    proc.stdout.pipe(res);
    proc.on('error', () => res.end());
    req.on('close', () => { try { proc.kill('SIGKILL'); } catch {} });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('====================================================');
  console.log('  CineFTP Local BDIX Bridge Active on port ' + PORT);
  console.log('  You can now browse 172.16.50.7 & all BDIX servers!');
  console.log('====================================================');
});
`.trim();

  const b64 = Buffer.from(nodeScript, 'utf8').toString('base64');
  const batContent = `@echo off
title CineFTP Local BDIX Bridge (127.0.0.1:7788)
color 0A
echo Starting CineFTP Local BDIX Network Bridge...
node -e "eval(Buffer.from('${b64}', 'base64').toString('utf8'))"
pause
`;

  res.setHeader('Content-Type', 'application/x-bat');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="Start-CineFTP-BDIX-Bridge.bat"'
  );
  res.send(batContent);
});

/**
 * API: AI Cinema Assistant powered by Gemini
 */
app.post(['/api/ai/assistant', '/ai/assistant'], async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  const libraryContext = Array.isArray(req.body?.libraryTitles)
    ? (req.body.libraryTitles as string[]).slice(0, 100).join(', ')
    : '';

  if (!prompt) {
    res.status(400).json({ error: 'Missing prompt' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const systemInstruction = `You are the CineFTP AI Cinema Assistant. Help the user discover movies and TV shows from their collection or recommend titles based on mood, genre, themes, or actors.
Current library samples available: [${libraryContext || 'English Movies, Korean Web Series, Hindi Movies, Animation, Dual Audio'}]
Keep suggestions engaging, informative (mention year, genre, and a 1-sentence hook), and concise. Recommend titles that are likely in an open directory/FTP collection.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: [{ text: `${systemInstruction}\n\nUser Question: ${prompt}` }] }
        ],
      });

      const reply = response.text || 'Here are some top picks for you!';
      res.json({ reply });
      return;
    } catch (err: any) {
      console.warn('Gemini API call error:', err?.message);
    }
  }

  // Graceful smart heuristic fallback if no GEMINI_API_KEY is configured
  const pLower = prompt.toLowerCase();
  let recommendations = '';
  if (pLower.includes('action') || pLower.includes('thrill')) {
    recommendations = 'Based on your library, try "Bloodhounds" (Korean Action Thriller), "John Wick", or "Teach You a Lesson" for intense martial arts and high-stakes drama.';
  } else if (pLower.includes('comedy') || pLower.includes('funny') || pLower.includes('laugh')) {
    recommendations = 'Looking for a laugh? Check out "Lovely Horribly", "Yumi\'s Cells", or popular animation hits like "Despicable Me" and "Kung Fu Panda".';
  } else if (pLower.includes('korean') || pLower.includes('kdrama') || pLower.includes('series')) {
    recommendations = 'Top Korean & Web Series in your catalog: "Teach You a Lesson" (★ 9.4), "Bloodhounds", "Tale of the Nine Tailed", and "Perfect Crown". All with multi-audio or dual-audio options!';
  } else if (pLower.includes('hindi') || pLower.includes('south')) {
    recommendations = 'For Hindi and South Indian cinema, you have rich collections under Hindi Movies and Hindi Dubbed (2,458 titles), including latest blockbuster action releases.';
  } else {
    recommendations = `Here are standout titles to stream right now in CineFTP:
1. **Teach You a Lesson** (2026, ★ 9.4) — Gripping action/drama series about an educational rights enforcement inspector.
2. **Bloodhounds** (Action Crime) — Fast-paced boxing and crime thriller with intense combat.
3. **Lovely Horribly** (Comedy / Romance) — Quirky, entertaining fate-swapping mystery.
4. **Where Stars Land** (Romance / Drama) — Touching story set at Incheon International Airport.`;
  }

  res.json({ reply: recommendations });
});

export default app;
