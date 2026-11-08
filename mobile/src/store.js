// Tiny IndexedDB key-value store. Everything the app remembers stays on this device.
// Keys: 'files' [{name,size,data:ArrayBuffer}], 'tpl:standard' / 'tpl:embg' {name,data}, 'session' {...}, 'history' [...]
const DB = 'nalogix';
const STORE = 'kv';
let dbp = null;

function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }
  return dbp;
}
function tx(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('aborted'));
  }));
}

export const store = {
  async get(key) { try { return await tx('readonly', (s) => s.get(key)); } catch { return undefined; } },
  set(key, value) { return tx('readwrite', (s) => s.put(value, key)); },
  del(key) { return tx('readwrite', (s) => s.delete(key)); },
  clear() { return tx('readwrite', (s) => s.clear()); },
  /** Ask the browser not to evict our data under storage pressure (best effort). */
  async persist() { try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch { return false; } },
};
