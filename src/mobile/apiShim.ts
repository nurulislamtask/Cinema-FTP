// Android app only: there is no Node backend on a phone, so the few /api/* routes the UI uses
// are answered here, on the device, using Capacitor's native HTTP client (no CORS, LAN servers allowed).
// In the browser and in the Windows app this file does nothing.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import {
  parseDirectoryHtml,
  extractMediaMetadata,
  formatBytes,
  buildBreadcrumbs,
  convertSrtToVtt,
} from '../utils/ftpParser';
import type { ParsedFtpItem } from '../utils/ftpParser';

type HttpOpts = {
  method?: string;
  headers?: Record<string, string>;
  json?: unknown;
  timeoutMs?: number;
};

async function http(url: string, o: HttpOpts = {}): Promise<{ status: number; text: string; url: string }> {
  const t = o.timeoutMs ?? 15000;
  const r: any = await CapacitorHttp.request({
    url,
    method: o.method || 'GET',
    headers: o.headers,
    data: o.json,
    responseType: 'text',
    connectTimeout: t,
    readTimeout: t,
  });
  const text = typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
  return { status: r.status, text, url: r.url || url };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const MEDIA_FILE_RE = /\.(mp4|mkv|webm|avi|mov|ts|m4v|flv|wmv|m2ts|srt|vtt|sub|ass)$/i;

/** h5ai servers (DhakaFlix) can list a folder through a JSON action when the HTML has no table. */
async function h5aiJson(targetUrl: string): Promise<ParsedFtpItem[]> {
  try {
    const u = new URL(targetUrl);
    const { text } = await http(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      json: { action: 'get', items: { href: u.pathname, what: 1 } },
      timeoutMs: 15000,
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
      } as ParsedFtpItem);
    }
    return items;
  } catch {
    return [];
  }
}

async function browse(rawUrl: string): Promise<unknown> {
  let url = rawUrl.trim();
  if (!url) return { error: 'Missing URL parameter' };
  if (!/^(https?|ftp):\/\//i.test(url)) url = `http://${url}`;
  if (/^ftp:/i.test(url)) {
    return {
      error: 'ftp:// links are not supported in the Android app. Use the http:// address of the same server.',
      targetUrl: url,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: 'Invalid URL', targetUrl: url };
  }

  // A direct link to a single media file
  const lastSeg = parsed.pathname.split('/').filter(Boolean).pop() || '';
  if (MEDIA_FILE_RE.test(lastSeg)) {
    let decoded = lastSeg;
    try {
      decoded = decodeURIComponent(lastSeg);
    } catch {}
    const meta = extractMediaMetadata(decoded, false);
    const isSubtitle = /\.(srt|vtt|ass|ssa|sub)$/i.test(decoded);
    const single = {
      id: url,
      rawName: decoded,
      cleanTitle: meta.cleanTitle,
      url,
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
    } as ParsedFtpItem;
    const parentDir = url.replace(/\/[^/]+\.[a-z0-9]+(\?.*)?$/i, '/');
    const { serverName, parentUrl, breadcrumbs } = buildBreadcrumbs(url);
    return {
      url,
      serverName,
      pageTitle: meta.cleanTitle,
      isH5ai: false,
      isPortalRoot: false,
      parentUrl: parentDir || parentUrl,
      breadcrumbs,
      items: isSubtitle ? [] : [single],
      subtitles: isSubtitle ? [single] : [],
      fetchedVia: 'backend',
    };
  }

  try {
    const { status, text, url: finalUrl } = await http(url, {
      headers: { Accept: 'text/html,application/xhtml+xml,*/*' },
      timeoutMs: 20000,
    });
    if (status >= 400) return { error: `Server answered HTTP ${status}`, targetUrl: url };

    const result = parseDirectoryHtml(text, finalUrl, 'backend');
    if (result.isH5ai && result.items.length === 0) {
      const h5 = await h5aiJson(finalUrl);
      if (h5.length > 0) result.items = h5;
    }
    if (result.items.length > 0) return result;
    return { error: 'No media items found at this URL.', targetUrl: url };
  } catch (err: any) {
    return { error: err?.message || 'Failed to connect to server', targetUrl: url };
  }
}

const metadataCache = new Map<string, unknown>();

async function getJson(url: string, headers?: Record<string, string>): Promise<any | null> {
  try {
    const r = await http(url, { headers, timeoutMs: 3500 });
    if (r.status >= 400) return null;
    return JSON.parse(r.text);
  } catch {
    return null;
  }
}

/** Same sources as the desktop backend: IMDb suggestions, TVMaze, Apple iTunes. */
async function metadata(title: string, kind: string, year?: number): Promise<unknown> {
  if (!title || title.length < 2) return { found: false };
  const cacheKey = `${title.toLowerCase()}|${year || ''}|${kind}`;
  if (metadataCache.has(cacheKey)) return metadataCache.get(cacheKey);

  const cleanQuery = title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const firstChar = cleanQuery[0] || 'a';
  const imdbSlug = encodeURIComponent(cleanQuery.slice(0, 40));

  let posterUrl: string | undefined;
  let backdropUrl: string | undefined;
  let imdbId: string | undefined;
  let imdbRating: string | undefined;
  let resolvedYear: number | undefined = year;
  let cast: string | undefined;
  let genres: string[] = [];
  let plot: string | undefined;
  let runtime: string | undefined;

  const isSeriesKind = kind === 'series' || kind === 'episode';
  // IMDb, TVMaze and iTunes are asked AT THE SAME TIME
  const [imdbData, tvData, itunesData] = await Promise.all([
    getJson(`https://v3.sg.media-imdb.com/suggestion/${firstChar}/${imdbSlug}.json`, {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'application/json',
    }),
    isSeriesKind ? getJson(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(title)}`) : Promise.resolve(null),
    getJson(
      `https://itunes.apple.com/search?term=${encodeURIComponent(year ? `${title} ${year}` : title)}&entity=${
        kind === 'series' ? 'tvSeason' : 'movie'
      }&limit=3`
    ),
  ]);

  if (imdbData) {
    const candidates: any[] = Array.isArray(imdbData?.d) ? imdbData.d : [];
    let best = candidates.find((c) => c.i?.imageUrl && year && c.y && Math.abs(Number(c.y) - year) <= 1);
    if (!best) {
      best = candidates.find(
        (c) => c.i?.imageUrl && (c.qid === 'movie' || c.qid === 'tvSeries' || c.qid === 'tvMiniSeries' || c.q)
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
    if (tvData.premiered && !resolvedYear) resolvedYear = parseInt(String(tvData.premiered).slice(0, 4), 10);
  }

  {
    const results: any[] = Array.isArray(itunesData?.results) ? itunesData.results : [];
    const match =
      results.find(
        (r) => year && r.releaseDate && Math.abs(parseInt(String(r.releaseDate).slice(0, 4), 10) - year) <= 1
      ) || results[0];
    if (match) {
      if (!posterUrl && match.artworkUrl100) posterUrl = String(match.artworkUrl100).replace('100x100bb', '600x900bb');
      if (match.artworkUrl100) backdropUrl = String(match.artworkUrl100).replace('100x100bb', '1200x675bb');
      if (!plot && (match.longDescription || match.shortDescription)) plot = match.longDescription || match.shortDescription;
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
  if (payload.found) metadataCache.set(cacheKey, payload);
  return payload;
}

async function subtitle(subUrl: string, offset: number): Promise<Response> {
  try {
    const { text } = await http(subUrl, { timeoutMs: 15000 });
    const vtt = /^﻿?\s*WEBVTT/i.test(text) ? text : convertSrtToVtt(text, offset);
    return new Response(vtt, { status: 200, headers: { 'Content-Type': 'text/vtt; charset=utf-8' } });
  } catch {
    return new Response('WEBVTT\n\n', { status: 200, headers: { 'Content-Type': 'text/vtt' } });
  }
}

function install() {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let u: URL;
    try {
      u = new URL(raw, window.location.href);
    } catch {
      return originalFetch(input, init);
    }
    if (u.origin !== window.location.origin || !u.pathname.startsWith('/api/')) {
      return originalFetch(input, init);
    }

    const route = u.pathname.slice('/api/'.length);
    const q = u.searchParams;

    switch (route) {
      case 'capabilities':
      case 'health':
        return jsonResponse({ isVercel: false, ffmpegAvailable: false, ffprobeAvailable: false, nodeEnv: 'android' });
      case 'browse':
        return jsonResponse(await browse(q.get('url') || ''));
      case 'metadata': {
        const yr = q.get('year') ? parseInt(q.get('year')!, 10) : undefined;
        return jsonResponse(await metadata((q.get('title') || '').trim(), q.get('kind') || 'movie', yr));
      }
      case 'subtitle':
        return subtitle(q.get('url') || '', parseFloat(q.get('offset') || '0') || 0);
      case 'probe':
        return jsonResponse({ error: 'Stream probing is not available on Android' });
      case 'ai/assistant':
        return jsonResponse({
          reply:
            'The AI assistant is not available in the Android app. Use the search bar and the Movies / TV Shows pages to find titles in your sources.',
        });
      default:
        return new Response('Not available in the Android app', { status: 404 });
    }
  };
}

if (Capacitor.isNativePlatform()) install();
