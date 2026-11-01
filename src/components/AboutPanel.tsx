import React from 'react';
import { ExternalLink, Heart, Code2 } from 'lucide-react';
import { ABOUT } from '../config/about';

export const AboutPanel: React.FC = () => {
  const social = ABOUT.social.filter((s) => s.url.trim());
  const version = typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ !== '0.0.0' ? __APP_VERSION__ : '';

  const Row = ({ label, url }: { label: string; url: string }) => (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-[#141A26] border border-[#20293D] hover:border-amber-500/40 hover:bg-[#182033] transition-colors"
    >
      <span className="text-sm text-zinc-200 font-medium">{label}</span>
      <ExternalLink className="w-4 h-4 text-zinc-500 shrink-0" />
    </a>
  );

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-[#0E121B] border border-[#1A2130] rounded-xl p-6 text-center space-y-2">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-[#E5A00D] to-[#B45309] flex items-center justify-center shadow-lg">
          <Code2 className="w-8 h-8 text-black" />
        </div>
        <h2 className="font-display font-bold text-xl text-white">{ABOUT.appName}</h2>
        {version && <p className="text-xs font-mono text-amber-400">Version {version}</p>}
        <p className="text-xs text-zinc-400 leading-relaxed max-w-md mx-auto">{ABOUT.tagline}</p>
        <p className="text-xs text-zinc-500 pt-2 flex items-center justify-center gap-1.5">
          Designed &amp; developed with <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" /> by{' '}
          <span className="text-zinc-200 font-semibold">{ABOUT.developer}</span>
        </p>
      </div>

      <div className="bg-[#0E121B] border border-[#1A2130] rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-100">Source &amp; updates</h3>
        <div className="grid gap-2">
          {ABOUT.links.filter((l) => l.url).map((l) => (
            <Row key={l.label} {...l} />
          ))}
        </div>
      </div>

      {social.length > 0 && (
        <div className="bg-[#0E121B] border border-[#1A2130] rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-zinc-100">Follow &amp; contact</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {social.map((l) => (
              <Row key={l.label} {...l} />
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-zinc-600 leading-relaxed px-1">
        CineFTP is a browser/player for servers you already have access to. It does not host or distribute any media.
      </p>
    </div>
  );
};
