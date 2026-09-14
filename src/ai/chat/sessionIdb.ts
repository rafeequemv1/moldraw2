/**
 * IndexedDB backup for chat sessions when localStorage quota is tight.
 * Primary path remains localStorage (sync); IDB is async mirror / fallback.
 */
import type { PersistedChatSession } from './sessionStorage';

const DB_NAME = 'moldraw.ai.chat';
const DB_VERSION = 1;
const STORE = 'sessions';
const KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

export async function idbSaveChatSession(session: PersistedChatSession): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(session, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    });
    db.close();
  } catch {
    /* private mode / blocked */
  }
}

export async function idbLoadChatSession(): Promise<PersistedChatSession | null> {
  try {
    const db = await openDb();
    const value = await new Promise<PersistedChatSession | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        const v = req.result;
        resolve(v && typeof v === 'object' ? (v as PersistedChatSession) : null);
      };
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

export async function idbClearChatSession(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
    });
    db.close();
  } catch {
    /* ignore */
  }
}
