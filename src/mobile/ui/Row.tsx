import React from 'react';
import { ChevronRight } from 'lucide-react';

/** Titled horizontal shelf. */
export const Row: React.FC<{
  title: string;
  subtitle?: string;
  onMore?: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, onMore, children }) => (
  <section className="mt-6">
    <div className="mb-2.5 flex items-end justify-between px-4 md:px-6">
      <div className="min-w-0">
        <h2 className="truncate text-[17px] font-bold tracking-tight text-white">{title}</h2>
        {subtitle && <p className="text-[11px] text-zinc-500">{subtitle}</p>}
      </div>
      {onMore && (
        <button onClick={onMore} className="flex items-center gap-0.5 pl-3 text-[12px] font-semibold text-amber-400 active:opacity-60">
          See all <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
    <div
      className="flex snap-x gap-3 overflow-x-auto px-4 md:px-6 pb-1"
      style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
    >
      {children}
    </div>
  </section>
);
