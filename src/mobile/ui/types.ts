import { ParsedFtpItem } from '../../utils/ftpParser';
import { AppSource, RecentlyPlayedEntry } from '../../types/cineftp';
import { EnrichedMetadata } from '../../services/ftpClient';

export type Tab = 'home' | 'movies' | 'series' | 'list' | 'more';

export interface ShellApi {
  library: ParsedFtpItem[];
  sources: AppSource[];
  watchlist: ParsedFtpItem[];
  recent: RecentlyPlayedEntry[];
  isSaved: (id: string) => boolean;
  toggleSave: (item: ParsedFtpItem) => void;
  openDetails: (item: ParsedFtpItem, meta: EnrichedMetadata | null) => void;
  play: (item: ParsedFtpItem, meta: EnrichedMetadata | null) => void;
  goTab: (tab: Tab) => void;
  openSearch: () => void;
  resumeTick: number;
}
