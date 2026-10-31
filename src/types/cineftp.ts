import { ParsedFtpItem } from '../utils/ftpParser';
import { EnrichedMetadata, SeasonFolderInfo } from '../services/ftpClient';

export interface AppSource {
  id: string;
  name: string;
  url: string;
  type: 'movies' | 'series';
  count: number;
  lastSynced?: string;
  status?: 'online' | 'syncing' | 'error';
  isPinned?: boolean;
}

export interface WatchlistEntry {
  item: ParsedFtpItem;
  addedAt: number;
}

export interface RecentlyPlayedEntry {
  id: string;
  video: ParsedFtpItem;
  seriesItem?: ParsedFtpItem;
  playlist: ParsedFtpItem[];
  subtitles: ParsedFtpItem[];
  seasons?: SeasonFolderInfo[];
  currentTime: number;
  duration: number;
  updatedAt: number;
}

export type ActiveNav =
  | 'home'
  | 'movies'
  | 'series'
  | 'watchlist'
  | 'recent'
  | 'settings'
  | { type: 'source'; sourceId: string };

export type SettingsTab =
  | 'sources'
  | 'player'
  | 'movie_info'
  | 'ai_assistant'
  | 'library_storage';
