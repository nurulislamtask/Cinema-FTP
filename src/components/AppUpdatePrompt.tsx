import React, { useEffect, useState } from 'react';
import { IS_CAPACITOR } from '../utils/platform';
import { NativePlayer } from '../mobile/nativePlayer';

const REPO = 'nurulislamtask/CineFTP-Releases';

function num(v: string): number[] {
  return v.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
}
function isNewer(a: string, b: string): boolean {
  const x = num(a);
  const y = num(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

/** Phone app: checks GitHub for a newer release and offers to download + install it. */
export const AppUpdatePrompt: React.FC = () => {
  const [update, setUpdate] = useState<{ version: string; apk: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!IS_CAPACITOR || !__APP_VERSION__ || __APP_VERSION__ === '0.0.0') return;
    let dismissed = '';
    try {
      dismissed = sessionStorage.getItem('cineftp_update_later') || '';
    } catch {}
    const timer = window.setTimeout(async () => {
      try {
        const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
          headers: { Accept: 'application/vnd.github+json' },
        });
        if (!r.ok) return;
        const rel = await r.json();
        const version = String(rel.tag_name || '');
        const apk = (rel.assets || []).find((a: any) => /\.apk$/i.test(a.name));
        if (apk && isNewer(version, __APP_VERSION__) && version !== dismissed) {
          setUpdate({ version: version.replace(/^v/i, ''), apk: apk.browser_download_url });
        }
      } catch {}
    }, 4000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!update) return null;

  const later = () => {
    try {
      sessionStorage.setItem('cineftp_update_later', 'v' + update.version);
    } catch {}
    setUpdate(null);
  };

  return (
    <div className="fixed inset-0 z-[500] bg-black/70 flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl bg-[#141824] border border-white/10 p-5 text-center">
        <h3 className="text-lg font-bold text-white">Update available</h3>
        <p className="text-sm text-zinc-400 mt-2">
          CineFTP {update.version} is ready (you have {__APP_VERSION__}). The download starts in the notification bar and
          the installer opens when it finishes.
        </p>
        <div className="flex gap-3 mt-5">
          <button onClick={later} className="flex-1 py-2.5 rounded-xl bg-white/10 text-zinc-200 font-semibold">
            Later
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await NativePlayer.installUpdate({ url: update.apk });
              } catch {}
              setUpdate(null);
            }}
            className="flex-1 py-2.5 rounded-xl bg-[#E5A00D] text-black font-bold"
          >
            {busy ? 'Starting…' : 'Update now'}
          </button>
        </div>
      </div>
    </div>
  );
};
