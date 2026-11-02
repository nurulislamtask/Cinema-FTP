import { useCallback, useEffect, useState } from 'react';

const KEY = 'cineftp_mobile_prefs_v1';

export interface MobilePrefs {
  heroAutoSlide: boolean;
  showContinue: boolean;
  resumePlayback: boolean;
  softwareDecoder: boolean;
  homeHidden: string[]; // source ids that are not shown on Home
}

const DEFAULTS: MobilePrefs = {
  heroAutoSlide: true,
  showContinue: true,
  resumePlayback: true,
  softwareDecoder: false,
  homeHidden: [],
};

export function readPrefs(): MobilePrefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function usePrefs(): [MobilePrefs, (patch: Partial<MobilePrefs>) => void] {
  const [prefs, setPrefs] = useState<MobilePrefs>(readPrefs);
  useEffect(() => {
    const on = () => setPrefs(readPrefs());
    window.addEventListener('cineftp:prefs', on);
    return () => window.removeEventListener('cineftp:prefs', on);
  }, []);
  const update = useCallback((patch: Partial<MobilePrefs>) => {
    const next = { ...readPrefs(), ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
    setPrefs(next);
    window.dispatchEvent(new Event('cineftp:prefs'));
  }, []);
  return [prefs, update];
}
