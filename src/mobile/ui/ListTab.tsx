import React, { useState } from 'react';
import { ShellApi } from './types';
import { MobilePoster } from './MobilePoster';

export const ListTab: React.FC<{ api: ShellApi }> = ({ api }) => {
  const [seg, setSeg] = useState<'list' | 'history'>('list');
  const items = seg === 'list' ? api.watchlist : api.recent.map((r) => r.video);
  const seg_ = (a: boolean) =>
    `flex-1 rounded-lg py-2 text-[13px] font-semibold ${a ? 'bg-amber-400 text-black' : 'text-zinc-300'}`;
  return (
    <div className="pb-4">
      <div className="px-4 pt-4">
        <h1 className="text-[22px] font-extrabold tracking-tight text-white">My Library</h1>
        <div className="mt-3 flex rounded-xl bg-white/[0.07] p-1">
          <button className={seg_(seg === 'list')} onClick={() => setSeg('list')}>
            My List ({api.watchlist.length})
          </button>
          <button className={seg_(seg === 'history')} onClick={() => setSeg('history')}>
            History ({api.recent.length})
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9 gap-x-2.5 md:gap-x-3 gap-y-4 px-3.5 md:px-6 pt-4">
        {items.map((it) => (
          <MobilePoster
            key={it.id}
            item={it}
            onOpen={seg === 'history' ? (i, m) => api.play(i, m) : api.openDetails}
            saved={api.isSaved(it.id)}
            onToggleSave={api.toggleSave}
          />
        ))}
      </div>
      {items.length === 0 && (
        <p className="px-8 pt-16 text-center text-sm text-zinc-500">
          {seg === 'list' ? 'Tap the + or bookmark on any title to keep it here.' : 'Titles you watch will appear here.'}
        </p>
      )}
    </div>
  );
};
