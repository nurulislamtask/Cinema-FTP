import React from 'react';
import { Home, Film, Tv, Bookmark, SlidersHorizontal } from 'lucide-react';
import { ActiveNav } from '../types/cineftp';

interface MobileBottomNavProps {
  activeNav: ActiveNav;
  onNavigate: (nav: ActiveNav) => void;
  watchlistCount: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeNav,
  onNavigate,
  watchlistCount,
}) => {
  const isNavActive = (key: string): boolean => {
    if (typeof activeNav === 'string') return activeNav === key;
    return false;
  };

  const navItems = [
    {
      key: 'home',
      label: 'Home',
      icon: Home,
    },
    {
      key: 'movies',
      label: 'Movies',
      icon: Film,
    },
    {
      key: 'series',
      label: 'Series',
      icon: Tv,
    },
    {
      key: 'watchlist',
      label: 'My List',
      icon: Bookmark,
      badge: watchlistCount > 0 ? watchlistCount : undefined,
    },
    {
      key: 'settings',
      label: 'Sources',
      icon: SlidersHorizontal,
    },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-[#090C12]/95 backdrop-blur-xl border-t border-white/10 px-3 py-1.5 flex items-center justify-around shadow-[0_-8px_24px_rgba(0,0,0,0.6)]">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = isNavActive(item.key);

        return (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key as ActiveNav)}
            className={`relative flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all cursor-pointer min-w-[56px] ${
              active
                ? 'text-amber-400 font-bold scale-105'
                : 'text-zinc-400 hover:text-zinc-200 active:scale-95'
            }`}
          >
            <div className="relative">
              <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5px] text-amber-400' : 'stroke-[1.8px]'}`} />
              {item.badge !== undefined && (
                <span className="absolute -top-1 -right-2 bg-amber-500 text-black text-[9px] font-black rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center shadow">
                  {item.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
            {active && (
              <span className="absolute -bottom-0.5 w-4 h-0.5 bg-amber-400 rounded-full" />
            )}
          </button>
        );
      })}
    </nav>
  );
};
