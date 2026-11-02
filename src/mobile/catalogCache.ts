// The whole library is kept on the phone (IndexedDB) so the app opens instantly and does not re-scan every start.
import { ParsedFtpItem } from '../utils/ftpParser';

const DB = 'cineftp_mobile';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface CatalogRecord {
  ts: number;
  key: string; // signature of the source list the catalog was built from
  items: ParsedFtpItem[];
}

export async function readCatalog(): Promise<CatalogRecord | null> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const r = db.transaction(STORE).objectStore(STORE).get('catalog');
      r.onsuccess = () => resolve((r.result as CatalogRecord) || null);
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function writeCatalog(rec: CatalogRecord): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec, 'catalog');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

export async function clearCatalog(): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete('catalog');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}
