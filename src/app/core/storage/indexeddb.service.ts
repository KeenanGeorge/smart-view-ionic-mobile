import { Injectable } from '@angular/core';
export interface KV<T> { key: string; value: T; }

@Injectable({ providedIn: 'root' })
export class IndexedDbService {
  private dbp: Promise<IDBDatabase>;
  private dbName = 'smart-view-db';
  private storeName = 'kv';

  constructor() {
    this.dbp = this.open();
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async get<T>(key: string): Promise<T | undefined> {
    const db = await this.dbp;
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  async set<T>(key: string, value: T): Promise<void> {
    const db = await this.dbp;
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const req = store.put(value as any, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
