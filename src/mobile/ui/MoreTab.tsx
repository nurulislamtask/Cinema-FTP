import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  Eye,
  EyeOff,
  Loader2,
  PlayCircle,
  Plus,
  RefreshCw,
  Trash2,
  Info,
} from 'lucide-react';
import { AppSource } from '../../types/cineftp';
import { MobilePrefs } from '../prefs';
import { clearCatalog } from '../catalogCache';
import { clearResume } from '../resume';
import { fetchLatestRelease, isNewer } from '../../components/AppUpdatePrompt';
import { NativePlayer } from '../nativePlayer';
import { AboutPanel } from '../../components/AboutPanel';

interface Props {
  sources: AppSource[];
  prefs: MobilePrefs;
  setPrefs: (p: Partial<MobilePrefs>) => void;
  libraryCount: number;
  updatedAt: number;
  scanning: boolean;
  progress: string;
  onRefresh: () => void;
  onAddSource: (s: { name: string; url: string; type: 'movies' | 'series' }) => Promise<void>;
  onRemoveSource: (id: string) => void;
  onSyncSource: (id: string) => Promise<void>;
  onClearHistory: () => void;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mt-6">
    <h2 className="mb-2 px-5 text-[11.5px] font-bold uppercase tracking-wider text-zinc-500">{title}</h2>
    <div className="mx-4 divide-y divide-white/[0.05] overflow-hidden rounded-2xl bg-[#0F121A] ring-1 ring-white/[0.05]">{children}</div>
  </section>
);

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <button
    role="switch"
    aria-checked={on}
    onClick={() => onChange(!on)}
    className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-amber-400' : 'bg-white/15'}`}
  >
    <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-[3px]'}`} />
  </button>
);

const Line: React.FC<{
  title: string;
  hint?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  icon?: React.ReactNode;
}> = ({ title, hint, right, onClick, danger, icon }) => (
  <div
    onClick={onClick}
    className={`flex items-center gap-3 px-4 py-3.5 ${onClick ? 'active:bg-white/[0.04]' : ''}`}
  >
    {icon && <span className="text-zinc-400">{icon}</span>}
    <div className="min-w-0 flex-1">
      <p className={`text-[14px] font-medium ${danger ? 'text-rose-400' : 'text-zinc-100'}`}>{title}</p>
      {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-zinc-500">{hint}</p>}
    </div>
    {right}
  </div>
);

function ago(ts: number) {
  if (!ts) return 'never';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

export const MoreTab: React.FC<Props> = (p) => {
  const [showSources, setShowSources] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<'movies' | 'series'>('movies');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [upd, setUpd] = useState<string>('');
  const [updApk, setUpdApk] = useState<string | null>(null);
  const [done, setDone] = useState('');

  const flash = (t: string) => {
    setDone(t);
    window.setTimeout(() => setDone(''), 2500);
  };

  const hiddenSet = new Set(p.prefs.homeHidden.length ? p.prefs.homeHidden : p.sources.filter((s) => /wwe|wrestl|aew/i.test(s.name)).map((s) => s.id));
  const toggleHome = (id: string) => {
    const next = new Set(hiddenSet);
    next.has(id) ? next.delete(id) : next.add(id);
    p.setPrefs({ homeHidden: [...next].length ? [...next] : ['__none__'] });
  };

  const checkUpdate = async () => {
    setUpd('Checking…');
    setUpdApk(null);
    const rel = await fetchLatestRelease();
    if (!rel) return setUpd('Could not reach the update server');
    if (typeof __APP_VERSION__ !== 'undefined' && isNewer(rel.version, __APP_VERSION__)) {
      setUpd(`Version ${rel.version} is available`);
      setUpdApk(rel.apk);
    } else setUpd("You're up to date");
  };

  return (
    <div className="pb-6">
      <div className="px-5 pt-5">
        <h1 className="text-[22px] font-extrabold tracking-tight text-white">Settings</h1>
        <p className="text-[12px] text-zinc-500">
          CineFTP {typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ !== '0.0.0' ? `v${__APP_VERSION__}` : ''}
        </p>
      </div>
      {done && (
        <div className="fixed left-1/2 top-4 z-[300] -translate-x-1/2 rounded-full bg-emerald-500 px-4 py-2 text-[13px] font-semibold text-black shadow-lg">
          {done}
        </div>
      )}

      <Section title="Library">
        <Line
          icon={<Database className="h-5 w-5" />}
          title="Sources"
          hint={`${p.sources.length} servers · ${p.libraryCount.toLocaleString()} titles`}
          onClick={() => setShowSources((v) => !v)}
          right={showSources ? <ChevronDown className="h-4 w-4 text-zinc-500" /> : <ChevronRight className="h-4 w-4 text-zinc-500" />}
        />
        {showSources && (
          <div className="bg-black/20">
            {p.sources.map((s) => (
              <div key={s.id} className="flex items-center gap-2 border-t border-white/[0.04] px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-zinc-100">{s.name}</p>
                  <p className="truncate text-[11px] text-zinc-500">
                    {s.type === 'movies' ? 'Movies' : 'Series'}
                    {s.count ? ` · ${s.count.toLocaleString()}` : ''}
                  </p>
                </div>
                <button
                  aria-label="Show on Home"
                  onClick={() => toggleHome(s.id)}
                  className="rounded-lg p-2 active:bg-white/10"
                >
                  {hiddenSet.has(s.id) ? <EyeOff className="h-4.5 w-4.5 text-zinc-500" /> : <Eye className="h-4.5 w-4.5 text-amber-400" />}
                </button>
                <button
                  aria-label="Re-scan"
                  disabled={busyId === s.id}
                  onClick={async () => {
                    setBusyId(s.id);
                    await p.onSyncSource(s.id);
                    setBusyId(null);
                    p.onRefresh();
                  }}
                  className="rounded-lg p-2 active:bg-white/10"
                >
                  {busyId === s.id ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" /> : <RefreshCw className="h-4 w-4 text-zinc-400" />}
                </button>
                <button
                  aria-label="Remove"
                  onClick={() => window.confirm(`Remove "${s.name}"?`) && p.onRemoveSource(s.id)}
                  className="rounded-lg p-2 active:bg-white/10"
                >
                  <Trash2 className="h-4 w-4 text-rose-400" />
                </button>
              </div>
            ))}
            <p className="px-4 pb-1 pt-2 text-[11px] text-zinc-500">The eye decides if a source is shown on the Home page.</p>
            <button onClick={() => setShowAdd((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-[13.5px] font-semibold text-amber-400 active:bg-white/[0.04]">
              <Plus className="h-4 w-4" /> Add a source
            </button>
            {showAdd && (
              <form
                className="space-y-2.5 px-4 pb-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!url.trim()) return;
                  setAdding(true);
                  await p.onAddSource({ name: name.trim() || url.trim(), url: url.trim(), type });
                  setAdding(false);
                  setName('');
                  setUrl('');
                  setShowAdd(false);
                  flash('Source added');
                  p.onRefresh();
                }}
              >
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Hindi Movies)" className="w-full rounded-xl bg-white/[0.07] px-3 py-3 text-[14px] text-white outline-none placeholder:text-zinc-500" />
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://172.16.50.x/…/" inputMode="url" autoCapitalize="none" className="w-full rounded-xl bg-white/[0.07] px-3 py-3 text-[14px] text-white outline-none placeholder:text-zinc-500" />
                <div className="flex rounded-xl bg-white/[0.07] p-1">
                  {(['movies', 'series'] as const).map((t) => (
                    <button type="button" key={t} onClick={() => setType(t)} className={`flex-1 rounded-lg py-2 text-[13px] font-semibold ${type === t ? 'bg-amber-400 text-black' : 'text-zinc-300'}`}>
                      {t === 'movies' ? 'Movies' : 'Series'}
                    </button>
                  ))}
                </div>
                <button disabled={adding} className="w-full rounded-xl bg-amber-400 py-3 text-[14px] font-bold text-black active:scale-[0.98]">
                  {adding ? 'Scanning…' : 'Add & scan'}
                </button>
              </form>
            )}
          </div>
        )}
        <Line
          icon={<RefreshCw className={`h-5 w-5 ${p.scanning ? 'animate-spin' : ''}`} />}
          title="Refresh library now"
          hint={p.scanning ? `Updating… ${p.progress}` : `Last updated ${ago(p.updatedAt)}. It also refreshes by itself every 6 hours.`}
          onClick={() => !p.scanning && p.onRefresh()}
        />
      </Section>

      <Section title="Home page">
        <Line title="Auto-slide the top banner" right={<Toggle on={p.prefs.heroAutoSlide} onChange={(v) => p.setPrefs({ heroAutoSlide: v })} />} />
        <Line title="Show Continue Watching" right={<Toggle on={p.prefs.showContinue} onChange={(v) => p.setPrefs({ showContinue: v })} />} />
      </Section>

      <Section title="Playback">
        <Line
          icon={<PlayCircle className="h-5 w-5" />}
          title="Resume where I stopped"
          hint="Start movies from the last position."
          right={<Toggle on={p.prefs.resumePlayback} onChange={(v) => p.setPrefs({ resumePlayback: v })} />}
        />
        <Line
          title="Software video decoder"
          hint="Turn on only if some movies show a black screen or fail. Slower, but plays more files."
          right={<Toggle on={p.prefs.softwareDecoder} onChange={(v) => p.setPrefs({ softwareDecoder: v })} />}
        />
        <Line title="Player gestures" hint="Swipe left side = brightness · right side = volume · swipe across = seek · double-tap sides = ∓10 s · hold = 2x speed · pinch = zoom." />
      </Section>

      <Section title="Storage">
        <Line
          title="Clear picture cache"
          hint="Posters are looked up again"
          onClick={() => {
            try {
              localStorage.removeItem('cineftp_meta_cache_v1');
            } catch {}
            flash('Picture cache cleared');
          }}
        />
        <Line
          title="Clear library cache"
          hint="The full list is scanned again from the servers"
          onClick={async () => {
            await clearCatalog();
            try {
              localStorage.removeItem('cineftp_indexed_cache_v3');
            } catch {}
            flash('Library cache cleared');
            p.onRefresh();
          }}
        />
        <Line
          title="Clear watch history"
          danger
          onClick={() => {
            if (!window.confirm('Remove history and Continue Watching?')) return;
            p.onClearHistory();
            clearResume();
            flash('History cleared');
          }}
        />
      </Section>

      <Section title="App">
        <Line
          icon={<Download className="h-5 w-5" />}
          title="Check for updates"
          hint={upd || 'Looks for a newer version of CineFTP'}
          onClick={checkUpdate}
          right={
            updApk ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  NativePlayer.installUpdate({ url: updApk }).catch(() => {});
                }}
                className="rounded-lg bg-amber-400 px-3 py-1.5 text-[12.5px] font-bold text-black"
              >
                Update
              </button>
            ) : null
          }
        />
        <Line
          icon={<Info className="h-5 w-5" />}
          title="About"
          onClick={() => setShowAbout((v) => !v)}
          right={showAbout ? <ChevronDown className="h-4 w-4 text-zinc-500" /> : <ChevronRight className="h-4 w-4 text-zinc-500" />}
        />
        {showAbout && (
          <div className="p-3">
            <AboutPanel />
          </div>
        )}
      </Section>
    </div>
  );
};
