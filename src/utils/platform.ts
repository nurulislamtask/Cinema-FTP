// Where is the UI running? (browser, Windows desktop app, or Android app)
const w: any = typeof window !== 'undefined' ? window : {};

export const IS_ELECTRON: boolean =
  typeof navigator !== 'undefined' && /Electron\//i.test(navigator.userAgent);

export const IS_CAPACITOR: boolean = Boolean(w.Capacitor?.isNativePlatform?.());

/** True for the Windows desktop app and the Android app: talk to private LAN servers directly. */
export const IS_NATIVE_APP: boolean = IS_ELECTRON || IS_CAPACITOR;
