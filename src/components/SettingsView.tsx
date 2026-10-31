import React, { useState } from 'react';
import {
  List,
  Monitor,
  Info,
  Sparkles,
  HardDrive,
  Film,
  Tv,
  CheckCircle2,
  RefreshCw,
  Trash2,
  Edit2,
  ExternalLink,
  Plus,
  Loader2,
  Download,
  AlertCircle,
  Pin,
  Check,
} from 'lucide-react';
import { AppSource, SettingsTab } from '../types/cineftp';

interface SettingsViewProps {
  sources: AppSource[];
  onAddSource: (source: { name: string; url: string; type: 'movies' | 'series' }) => Promise<void>;
  onRemoveSource: (id: string) => void;
  onSyncSource: (id: string) => Promise<void>;
  onSyncAll: () => Promise<void>;
  isSyncingAll: boolean;
  activeTab?: SettingsTab;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  sources,
  onAddSource,
  onRemoveSource,
  onSyncSource,
  onSyncAll,
  isSyncingAll,
  activeTab = 'sources',
}) => {
  const [tab, setTab] = useState<SettingsTab>(activeTab);

  // Form states for "Add a link"
  const [newUrl, setNewUrl] = useState('');
  const [newType, setNewType] = useState<'movies' | 'series'>('movies');
  const [newName, setNewName] = useState('');
  const [isCheckingLink, setIsCheckingLink] = useState(false);
  const [checkStatus, setCheckStatus] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Player Settings State
  const [defaultAudio, setDefaultAudio] = useState('hin');
  const [enableTranscodeFallback, setEnableTranscodeFallback] = useState(true);
  const [bufferChunkMb, setBufferChunkMb] = useState(3);

  // Movie Info Settings State
  const [useImdb, setUseImdb] = useState(true);
  const [useTvMaze, setUseTvMaze] = useState(true);

  // Auto-fill suggested name from URL when user pastes
  const handleUrlChange = (val: string) => {
    setNewUrl(val);
    if (!newName) {
      try {
        const u = new URL(val);
        const segments = u.pathname.split('/').filter(Boolean);
        const last = segments[segments.length - 1];
        if (last) {
          const clean = decodeURIComponent(last).replace(/[-_]+/g, ' ');
          setNewName(clean);
          if (/series|tv|korean/i.test(clean)) setNewType('series');
        }
      } catch {}
    }
  };

  const handleCheckLink = async () => {
    if (!newUrl) return;
    setIsCheckingLink(true);
    setCheckStatus(null);
    try {
      const res = await fetch(`/api/browse?url=${encodeURIComponent(newUrl.trim())}`);
      const data = await res.json();
      if (data.items && Array.isArray(data.items)) {
        setCheckStatus(`Valid! Found ${data.items.length} items`);
      } else {
        setCheckStatus('Server responded, but no media items were found');
      }
    } catch {
      setCheckStatus('Could not reach server directly (will use BDIX Gateway)');
    } finally {
      setIsCheckingLink(false);
    }
  };

  const handleAddAndSync = async () => {
    if (!newUrl.trim() || !newName.trim()) return;
    setIsAdding(true);
    try {
      await onAddSource({
        name: newName.trim(),
        url: newUrl.trim(),
        type: newType,
      });
      setNewUrl('');
      setNewName('');
      setCheckStatus(null);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-8 py-7 space-y-7 select-none bg-[#090A0F] text-zinc-100 pb-28">
      {/* Settings Title (Matching Screenshot 1) */}
      <div>
        <h1 className="font-display font-bold text-3xl text-white tracking-tight">
          Settings
        </h1>
      </div>

      {/* Settings Navigation Tabs (Matching Screenshot 1) */}
      <div className="flex items-center gap-1 border-b border-[#161B24] pb-2 text-xs font-medium">
        <button
          onClick={() => setTab('sources')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors cursor-pointer ${
            tab === 'sources'
              ? 'bg-[#181E2B] text-white font-semibold'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#121620]'
          }`}
        >
          <List className="w-4 h-4" />
          <span>Sources</span>
        </button>

        <button
          onClick={() => setTab('player')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors cursor-pointer ${
            tab === 'player'
              ? 'bg-[#181E2B] text-white font-semibold'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#121620]'
          }`}
        >
          <Monitor className="w-4 h-4" />
          <span>Player</span>
        </button>

        <button
          onClick={() => setTab('movie_info')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors cursor-pointer ${
            tab === 'movie_info'
              ? 'bg-[#181E2B] text-white font-semibold'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#121620]'
          }`}
        >
          <Info className="w-4 h-4" />
          <span>Movie info</span>
        </button>

        <button
          onClick={() => setTab('ai_assistant')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors cursor-pointer ${
            tab === 'ai_assistant'
              ? 'bg-[#181E2B] text-white font-semibold'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#121620]'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>AI assistant</span>
        </button>

        <button
          onClick={() => setTab('library_storage')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors cursor-pointer ${
            tab === 'library_storage'
              ? 'bg-[#181E2B] text-white font-semibold'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#121620]'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          <span>Library & storage</span>
        </button>
      </div>

      {/* TAB 1: SOURCES (Matching Screenshot 1) */}
      {tab === 'sources' && (
        <div className="space-y-8 max-w-5xl">
          {/* Section: Add a link */}
          <div className="bg-[#0E121B] border border-[#1A2130] rounded-xl p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-base text-zinc-100">Add a link</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                A movie folder (category, year or collection) or a TV series folder such as KOREAN TV & WEB Series.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              {/* Folder link input */}
              <div className="md:col-span-5 space-y-1">
                <label className="text-[11px] font-mono font-medium text-zinc-400 uppercase tracking-wider">
                  Folder link
                </label>
                <input
                  type="text"
                  value={newUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  placeholder="http://172.16.50.14/DHAKA-FLIX-14/English Movies/"
                  className="w-full bg-[#141A26] border border-[#20293D] focus:border-amber-500 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none transition-colors"
                />
                <p className="text-[10px] text-zinc-500">
                  A category or year folder. Everything inside it is scanned.
                </p>
              </div>

              {/* Type segmented toggle */}
              <div className="md:col-span-3 space-y-1">
                <label className="text-[11px] font-mono font-medium text-zinc-400 uppercase tracking-wider">
                  Type
                </label>
                <div className="flex rounded-lg bg-[#141A26] border border-[#20293D] p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setNewType('movies')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-xs rounded font-medium transition-colors cursor-pointer ${
                      newType === 'movies'
                        ? 'bg-[#1C2333] text-zinc-100 shadow'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>Movies</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewType('series')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-xs rounded font-medium transition-colors cursor-pointer ${
                      newType === 'series'
                        ? 'bg-[#1C2333] text-zinc-100 shadow'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Tv className="w-3.5 h-3.5" />
                    <span>TV shows</span>
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500">
                  {newType === 'movies' ? 'Folder → Movie folders' : 'Folder → Series episodes'}
                </p>
              </div>

              {/* Name input */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-[11px] font-mono font-medium text-zinc-400 uppercase tracking-wider">
                  Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="English Movies 1080p"
                  className="w-full bg-[#141A26] border border-[#20293D] focus:border-amber-500 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none transition-colors"
                />
                <p className="text-[10px] text-zinc-500">Shown in the sidebar.</p>
              </div>

              {/* Buttons */}
              <div className="md:col-span-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCheckLink}
                  disabled={!newUrl || isCheckingLink}
                  className="px-3 py-2 rounded-lg bg-[#141A26] hover:bg-[#1D2536] border border-[#20293D] text-xs font-medium text-zinc-300 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  {isCheckingLink ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Check link'}
                </button>

                <button
                  type="button"
                  onClick={handleAddAndSync}
                  disabled={!newUrl || !newName || isAdding}
                  className="flex-1 px-3 py-2 rounded-lg bg-[#E5A00D] hover:bg-[#F59E0B] text-black font-semibold text-xs transition-colors flex items-center justify-center gap-1 shadow disabled:opacity-40 cursor-pointer"
                >
                  {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '+ Add and sync'}
                </button>
              </div>
            </div>

            {checkStatus && (
              <div className="text-xs font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0" />
                <span>{checkStatus}</span>
              </div>
            )}
          </div>

          {/* Section: Your sources */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-base text-zinc-100">Your sources</h2>
                <p className="text-xs text-zinc-500">{sources.length} links</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onSyncAll}
                  disabled={isSyncingAll}
                  className="px-3.5 py-1.5 rounded-lg bg-[#141A26] hover:bg-[#1D2536] border border-[#20293D] text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
                >
                  Full rescan
                </button>

                <button
                  onClick={onSyncAll}
                  disabled={isSyncingAll}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isSyncingAll
                      ? 'bg-[#E5A00D] text-black shadow'
                      : 'bg-[#1C2333] hover:bg-[#252E44] text-amber-400 border border-amber-500/20'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin' : ''}`} />
                  <span>{isSyncingAll ? 'Syncing...' : 'Sync all'}</span>
                </button>
              </div>
            </div>

            {/* Source Card List (Matching Screenshot 1) */}
            <div className="space-y-2">
              {sources.map((src) => (
                <div
                  key={src.id}
                  className="bg-[#0E121B] border border-[#1A2130] hover:border-[#273248] rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                >
                  <div className="space-y-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <h4 className="font-semibold text-sm text-zinc-100 truncate">
                        {src.name}
                      </h4>
                      <span className="text-[10px] font-mono uppercase bg-[#181F2E] px-2 py-0.5 rounded text-zinc-300 border border-white/5">
                        {src.type === 'series' ? 'TV shows' : 'Movies'}
                      </span>
                      <span className="text-[11px] font-mono text-zinc-400 bg-[#141A26] px-2 py-0.5 rounded">
                        {src.count.toLocaleString()} {src.type === 'series' ? 'shows' : 'movies'}
                      </span>
                    </div>

                    <p className="text-[11px] font-mono text-zinc-500 truncate pl-4.5">
                      {src.url}
                    </p>
                    <p className="text-[10px] font-mono text-zinc-600 pl-4.5">
                      Synced {src.lastSynced || '2 h ago'}
                    </p>
                  </div>

                  {/* Actions on right */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center pl-4.5 sm:pl-0">
                    <button
                      onClick={() => onSyncSource(src.id)}
                      className="px-2.5 py-1 rounded bg-[#141A26] hover:bg-[#1D2536] border border-[#20293D] text-[11px] font-mono text-zinc-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Sync this source"
                    >
                      <RefreshCw className="w-3 h-3 text-zinc-400" />
                      <span>Sync</span>
                    </button>

                    <button
                      onClick={() => onRemoveSource(src.id)}
                      className="p-1.5 rounded hover:bg-rose-500/10 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                      title="Delete source"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PLAYER */}
      {tab === 'player' && (
        <div className="max-w-2xl space-y-6 bg-[#0E121B] border border-[#1A2130] rounded-xl p-6">
          <h2 className="font-semibold text-base text-zinc-100">Player Preferences</h2>

          <div className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="text-zinc-300 font-medium">Default Audio Track</label>
              <select
                value={defaultAudio}
                onChange={(e) => setDefaultAudio(e.target.value)}
                className="w-full bg-[#141A26] border border-[#20293D] rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
              >
                <option value="hin">Hindi Dubbed / Dual Audio (Preferred)</option>
                <option value="eng">English Original</option>
                <option value="first">First Available Stream</option>
              </select>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div>
                <p className="text-zinc-200 font-medium">Auto FFmpeg Video Remuxing</p>
                <p className="text-zinc-500 text-[11px]">
                  Instantly remux 10-bit HEVC or unplayable MKVs into browser-compatible MP4
                </p>
              </div>
              <input
                type="checkbox"
                checked={enableTranscodeFallback}
                onChange={(e) => setEnableTranscodeFallback(e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </div>

            <div className="space-y-1 pt-2">
              <label className="text-zinc-300 font-medium">HTTP Range Streaming Chunk Size</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max="8"
                  value={bufferChunkMb}
                  onChange={(e) => setBufferChunkMb(parseInt(e.target.value, 10))}
                  className="flex-1 accent-amber-500"
                />
                <span className="font-mono text-zinc-300">{bufferChunkMb} MB</span>
              </div>
              <p className="text-[10px] text-zinc-500">
                Smaller chunk size (3 MB) gives sub-second startup and fast seeking on BDIX links.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MOVIE INFO */}
      {tab === 'movie_info' && (
        <div className="max-w-2xl space-y-6 bg-[#0E121B] border border-[#1A2130] rounded-xl p-6">
          <h2 className="font-semibold text-base text-zinc-100">Metadata & Poster Scrapers</h2>
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-200 font-medium">IMDb Suggestions API</p>
                <p className="text-zinc-500 text-[11px]">Automatic HD movie posters, ratings and cast enrichment</p>
              </div>
              <input
                type="checkbox"
                checked={useImdb}
                onChange={(e) => setUseImdb(e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-200 font-medium">TVMaze Series Synopses</p>
                <p className="text-zinc-500 text-[11px]">Automatic TV series season information & episode summaries</p>
              </div>
              <input
                type="checkbox"
                checked={useTvMaze}
                onChange={(e) => setUseTvMaze(e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: AI ASSISTANT */}
      {tab === 'ai_assistant' && (
        <div className="max-w-2xl space-y-6 bg-[#0E121B] border border-[#1A2130] rounded-xl p-6">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="font-semibold text-base text-zinc-100">Gemini AI Cinema Assistant</h2>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            The AI assistant indexes your local FTP links and helps you discover titles by mood, cast, genre, or plots. Powered by Gemini 2.5 Flash through server-side integration.
          </p>

          <div className="p-4 rounded-lg bg-[#141A26] border border-[#20293D] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-300 font-medium">Assistant Model</span>
              <span className="font-mono text-amber-400">gemini-2.5-flash</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-300 font-medium">Floating FAB Trigger</span>
              <span className="text-emerald-400 font-medium">Enabled (Bottom Right ✨)</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: LIBRARY & STORAGE */}
      {tab === 'library_storage' && (
        <div className="max-w-2xl space-y-6 bg-[#0E121B] border border-[#1A2130] rounded-xl p-6">
          <h2 className="font-semibold text-base text-zinc-100">Library & Local Storage</h2>
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-lg bg-[#141A26] border border-[#20293D] flex items-center justify-between">
              <div>
                <p className="text-zinc-200 font-medium">1-Click Local BDIX Bridge</p>
                <p className="text-zinc-500 text-[11px]">
                  Download Windows .bat script to bridge your home LAN (172.16.50.7) to CineFTP
                </p>
              </div>
              <a
                href="/api/bdix-bridge.bat"
                download="Start-CineFTP-BDIX-Bridge.bat"
                className="px-3 py-2 bg-[#E5A00D] hover:bg-[#F59E0B] text-black font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .bat</span>
              </a>
            </div>

            <div className="p-4 rounded-lg bg-[#141A26] border border-[#20293D] flex items-center justify-between">
              <div>
                <p className="text-zinc-200 font-medium">Clear Metadata & Poster Cache</p>
                <p className="text-zinc-500 text-[11px]">Resets local browser poster and title cache</p>
              </div>
              <button
                onClick={() => {
                  localStorage.removeItem('cineftp_meta_cache_v1');
                  window.location.reload();
                }}
                className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-colors cursor-pointer"
              >
                Clear Cache
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
