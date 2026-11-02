// Where the user stopped in each video (written by NativePlayerLauncher when the player closes).
const KEY = 'cineftp_resume_v1';

export type ResumeMap = Record<string, { t: number; d: number }>;

export function readResume(): ResumeMap {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function clearResume(id?: string) {
  try {
    if (!id) return localStorage.removeItem(KEY);
    const all = readResume();
    delete all[id];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
