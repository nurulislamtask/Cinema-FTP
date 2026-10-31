import React from 'react';
import {
  Home,
  Film,
  Tv,
  Bookmark,
  Clock,
  Plus,
  SlidersHorizontal,
  Folder,
  X,
} from 'lucide-react';
import { AppSource, ActiveNav } from '../types/cineftp';

interface SidebarProps {
  activeNav: ActiveNav;
  onNavigate: (nav: ActiveNav) => void;
  sources: AppSource[];
  moviesCount: number;
  seriesCount: number;
  recentCount: number;
  watchlistCount: number;
  onAddSourceClick: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeNav,
  onNavigate,
  sources,
  moviesCount,
  seriesCount,
  recentCount,
  watchlistCount,
  onAddSourceClick,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const isNavActive = (key: string): boolean => {
    if (typeof activeNav === 'string') return activeNav === key;
    if (activeNav.type === 'source') return activeNav.sourceId === key;
    return false;
  };

  const handleNav = (nav: ActiveNav) => {
    onNavigate(nav);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {/* Mobile Dark Backdrop */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/75 backdrop-blur-xs z-40 md:hidden transition-opacity"
        />
      )}

      <aside
        className={`fixed md:relative inset-y-0 left-0 z-50 w-64 bg-[#0B0E14] border-r border-[#1B212D] flex flex-col h-screen shrink-0 select-none overflow-hidden transition-transform duration-200 ease-out shadow-2xl md:shadow-none ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-[#161B24]">
          <div
            onClick={() => handleNav('home')}
            className="flex items-center gap-3 cursor-pointer hover:opacity-90 transition-opacity"
          >
            <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 via-rose-500 to-cyan-500 p-[1.5px] flex items-center justify-center shadow-lg shadow-amber-500/10">
              <div className="w-full h-full bg-[#0D1117] rounded-[7px] flex items-center justify-center">
                <span className="font-display font-black text-sm tracking-tighter bg-gradient-to-r from-amber-400 via-rose-400 to-cyan-400 bg-clip-text text-transparent">
                  CF
                </span>
              </div>
            </div>
            <div>
              <h1 className="font-display font-bold text-base text-zinc-100 tracking-tight leading-none">
                CineFTP
              </h1>
              <span className="text-[11px] font-mono text-zinc-500 tracking-wide">
                Local library
              </span>
            </div>
          </div>

          {/* Mobile Close Button */}
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 md:hidden transition-colors cursor-pointer"
              title="Close Menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

      {/* Scrollable Navigation Area */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5 text-[13px] custom-sidebar-scroll">
        {/* Core Nav */}
        <div className="space-y-1">
          <button
            onClick={() => handleNav('home')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer ${
              isNavActive('home')
                ? 'bg-[#181E2B] text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#121620]'
            }`}
          >
            <Home className="w-4 h-4 text-zinc-400" />
            <span>Home</span>
          </button>

          <button
            onClick={() => handleNav('movies')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer ${
              isNavActive('movies')
                ? 'bg-[#181E2B] text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#121620]'
            }`}
          >
            <div className="flex items-center gap-3">
              <Film className="w-4 h-4 text-zinc-400" />
              <span>Movies</span>
            </div>
            {moviesCount > 0 && (
              <span className="text-[11px] font-mono text-zinc-500">
                {moviesCount.toLocaleString()}
              </span>
            )}
          </button>

          <button
            onClick={() => handleNav('series')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer ${
              isNavActive('series')
                ? 'bg-[#181E2B] text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#121620]'
            }`}
          >
            <div className="flex items-center gap-3">
              <Tv className="w-4 h-4 text-zinc-400" />
              <span>TV Shows</span>
            </div>
            {seriesCount > 0 && (
              <span className="text-[11px] font-mono text-zinc-500">
                {seriesCount.toLocaleString()}
              </span>
            )}
          </button>
        </div>

        {/* Library Section */}
        <div className="space-y-1">
          <div className="px-3 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
            LIBRARY
          </div>

          <button
            onClick={() => handleNav('watchlist')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer ${
              isNavActive('watchlist')
                ? 'bg-[#181E2B] text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#121620]'
            }`}
          >
            <div className="flex items-center gap-3">
              <Bookmark className="w-4 h-4 text-zinc-400" />
              <span>Watchlist</span>
            </div>
            {watchlistCount > 0 && (
              <span className="text-[11px] font-mono text-zinc-500">
                {watchlistCount}
              </span>
            )}
          </button>

          <button
            onClick={() => handleNav('recent')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer ${
              isNavActive('recent')
                ? 'bg-[#181E2B] text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#121620]'
            }`}
          >
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-zinc-400" />
              <span>Recently played</span>
            </div>
            {recentCount > 0 && (
              <span className="text-[11px] font-mono text-zinc-500">
                {recentCount}
              </span>
            )}
          </button>
        </div>

        {/* Sources Section */}
        <div className="space-y-1">
          <div className="px-3 flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
            <span>SOURCES</span>
            <button
              onClick={() => {
                onAddSourceClick();
                if (onCloseMobile) onCloseMobile();
              }}
              className="p-1 hover:text-zinc-200 hover:bg-[#181E2B] rounded transition-colors cursor-pointer"
              title="Add a new FTP source"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-0.5">
            {sources.map((src) => {
              const active = isNavActive(src.id);
              return (
                <button
                  key={src.id}
                  onClick={() => handleNav({ type: 'source', sourceId: src.id })}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-left transition-colors cursor-pointer group ${
                    active
                      ? 'bg-[#181E2B] text-zinc-100 font-medium'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#121620]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    {src.type === 'series' ? (
                      <Tv className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    ) : (
                      <Film className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    )}
                    <span className="truncate text-[12.5px]">{src.name}</span>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-500 tabular-nums shrink-0">
                    {src.count > 0 ? src.count.toLocaleString() : '0'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Settings Link */}
      <div className="p-3 border-t border-[#161B24]">
        <button
          onClick={() => handleNav('settings')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-[13px] transition-colors cursor-pointer ${
            isNavActive('settings')
              ? 'bg-[#181E2B] text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#121620]'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4 text-zinc-400" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  </>
);
};
