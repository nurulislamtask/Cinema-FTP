import React from 'react';
import { Home, Film, Tv, Bookmark, Settings } from 'lucide-react';
import { Tab } from './types';

const TABS: { id: Tab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'movies', label: 'Movies', Icon: Film },
  { id: 'series', label: 'Series', Icon: Tv },
  { id: 'list', label: 'My List', Icon: Bookmark },
  { id: 'more', label: 'Settings', Icon: Settings },
];

export const BottomNav: React.FC<{ tab: Tab; onChange: (t: Tab) => void }> = ({ tab, onChange }) => (
  <nav
    className="fixed inset-x-0 bottom-0 z-[150] border-t border-white/[0.06] bg-[#0B0D13]/92 backdrop-blur-xl"
    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
  >
    <div className="mx-auto flex max-w-xl items-stretch justify-around px-1">
      {TABS.map(({ id, label, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 active:scale-95"
          >
            <span className={`rounded-full px-4 py-1 transition-colors ${active ? 'bg-amber-400/15' : ''}`}>
              <Icon className={`h-[22px] w-[22px] ${active ? 'text-amber-400' : 'text-zinc-500'}`} />
            </span>
            <span className={`text-[10.5px] font-semibold ${active ? 'text-amber-400' : 'text-zinc-500'}`}>{label}</span>
          </button>
        );
      })}
    </div>
  </nav>
);
