import type { OutboxItem } from './BackendTypes';

/**
 * Durable queue of mutations made while offline.
 *
 * IndexedDB rather than localStorage: the queue can hold whole run payloads,
 * localStorage is a synchronous 5MB budget already shared with the profile,
 * and a blocked main thread during a rally is exactly what we spent the
 * performance work avoiding.
 */
const DB_NAME = 'bbb-outbox';
const STORE = 'ops';

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (): void => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = (): void => resolve(req.result);
      req.onerror = (): void => resolve(null);
    } catch {
      resolve(null); // private mode / disabled storage
    }
  });
}

export class Outbox {
  private memory: OutboxItem[] = [];

  async add(item: OutboxItem): Promise<void> {
    const db = await open();
    if (!db) {
      this.memory.push(item);
      return;
    }
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(item);
      tx.oncomplete = (): void => resolve();
      tx.onerror = (): void => resolve();
    });
  }

  async all(): Promise<OutboxItem[]> {
    const db = await open();
    if (!db) return [...this.memory];
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = (): void => resolve((req.result as OutboxItem[]) ?? []);
      req.onerror = (): void => resolve([]);
    });
  }

  /** Records one more failed attempt, so a poison item can be given up on. */
  async bumpRetries(id: string): Promise<void> {
    const db = await open();
    if (!db) {
      const item = this.memory.find((i) => i.id === id);
      if (item) item.retries += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.get(id);
      req.onsuccess = (): void => {
        const item = req.result as OutboxItem | undefined;
        if (item) store.put({ ...item, retries: item.retries + 1 });
      };
      tx.oncomplete = (): void => resolve();
      tx.onerror = (): void => resolve();
    });
  }

  async remove(id: string): Promise<void> {
    const db = await open();
    if (!db) {
      this.memory = this.memory.filter((i) => i.id !== id);
      return;
    }
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = (): void => resolve();
      tx.onerror = (): void => resolve();
    });
  }
}
