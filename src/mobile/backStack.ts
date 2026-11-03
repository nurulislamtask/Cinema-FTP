// Android back button: the native side asks the page "did you handle it?" before leaving the app.
type Handler = () => boolean;
const handlers: Handler[] = [];

if (typeof window !== 'undefined') {
  (window as any).__cineBack = () => {
    for (let i = handlers.length - 1; i >= 0; i--) {
      try {
        if (handlers[i]()) return true;
      } catch {
        /* ignore */
      }
    }
    return false;
  };
}

/** Later registrations win. Return true from the handler when it closed something. */
export function registerBack(h: Handler): () => void {
  handlers.push(h);
  return () => {
    const i = handlers.indexOf(h);
    if (i >= 0) handlers.splice(i, 1);
  };
}
