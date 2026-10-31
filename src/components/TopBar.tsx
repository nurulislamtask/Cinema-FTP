import React, { useEffect, useRef } from 'react';
import {
  Search,
  Loader2,
  Maximize2,
  Minimize2,
  HardDrive,
  CheckCircle2,
  Wifi,
  Menu,
} from 'lucide-react';

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  syncProgress?: {
    isSyncing: boolean;
    current: number;
    total: number;
  };
  onOpenSearchFocus?: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onToggleMobileMenu?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  searchQuery,
  onSearchChange,
  syncProgress,
  isFullscreen,
  onToggleFullscreen,
  onToggleMobileMenu,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="h-14 bg-[#0B0E14] border-b border-[#161B24] px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 select-none shrink-0 z-20">
      {/* Mobile Menu Hamburger Button */}
      {onToggleMobileMenu && (
        <button
          onClick={onToggleMobileMenu}
          className="md:hidden p-2 -ml-1 text-zinc-400 hover:text-white hover:bg-[#181E2B] rounded-lg transition-colors cursor-pointer shrink-0"
          title="Open Menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Search Input Box */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search movies, shows, years..."
          className="w-full bg-[#121620] border border-[#1E2536] focus:border-amber-500/60 rounded-lg pl-9 pr-8 sm:pr-16 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-colors"
        />
        <div className="hidden sm:block absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-[#1A202E] border border-white/5 text-[10px] font-mono text-zinc-400 pointer-events-none">
          Ctrl K
        </div>
      </div>

      {/* Right Status Indicator & Controls */}
      <div className="flex items-center gap-2 sm:gap-4 text-xs font-mono shrink-0">
        {/* Sync / Metadata Lookup Progress */}
        {syncProgress && syncProgress.total > 0 ? (
          <div className="flex items-center gap-1.5 sm:gap-2 text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs">
            {syncProgress.isSyncing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
            <span className="hidden md:inline">Looking up movie info · </span>
            <span>
              {syncProgress.current.toLocaleString()} / {syncProgress.total.toLocaleString()}
            </span>
          </div>
        ) : (
          <div className="hidden sm:flex items-center gap-2 text-zinc-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500/80"></span>
            <span className="text-[11px] font-mono">BDIX FTP Ready</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 text-zinc-400">
          <button
            onClick={onToggleFullscreen}
            className="p-1.5 hover:text-zinc-200 hover:bg-[#181E2B] rounded-lg transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
