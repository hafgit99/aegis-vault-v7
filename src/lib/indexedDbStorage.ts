/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const DB_NAME = 'KalderaShield_setup_db';
const STORE_NAME = 'KalderaShield_setup_store';
const DB_VERSION = 1;

const inMemoryCache: Record<string, string | null> = {};

/**
 * O-2: keys whose localStorage mirror write was swallowed, most recent first.
 *
 * Every localStorage write in this module is wrapped in `catch {}`, because a
 * full quota or a locked-down storage policy must not break IndexedDB, which is
 * the real store. That is the right behaviour and it hid the finding: the vault
 * mirror (`kalderashield_fallback`) is megabytes, it is the one value here large
 * enough to hit the quota, and when its write failed the mirror silently fell
 * behind the authoritative copy. A "recovery mirror" that is quietly out of date
 * is worse than no mirror, because it is offered to the user as a backup.
 *
 * A query rather than a callback or a listener, and both alternatives were worse:
 * a listener has to be registered, and registering one at module scope runs into
 * every test that partially mocks this module (a real hazard here, not a
 * hypothetical -- it broke three suites). A plain query has no import-time side
 * effect, so mocking stays trivial.
 *
 * Cleared on the next successful write of the same key, so one transient quota
 * error does not mark a key forever.
 */
const failedLocalMirrorWrites = new Set<string>();

/** True when the most recent localStorage mirror write of `key` was swallowed. */
export function didLocalMirrorWriteFail(key: string): boolean {
  return failedLocalMirrorWrites.has(key);
}

function reportLocalMirrorWriteFailure(key: string, _error: unknown): void {
  failedLocalMirrorWrites.add(key);
}

function reportLocalMirrorWriteSuccess(key: string): void {
  failedLocalMirrorWrites.delete(key);
}

function initSetupDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export function getIndexedDbItem(key: string): Promise<string | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return initSetupDB()
    .then((db) => {
      return new Promise<string | null>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => {
          resolve(request.result !== undefined ? request.result : null);
          db.close();
        };
        request.onerror = () => {
          reject(request.error);
          db.close();
        };
      });
    })
    .catch((err) => {
      console.error(`Error reading IndexedDB item ${key}:`, err);
      return null;
    });
}

export function setIndexedDbItem(key: string, value: string): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve();
  }
  return initSetupDB()
    .then((db) => {
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.put(value, key);
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      });
    })
    .catch((err) => {
      console.error(`Error writing IndexedDB item ${key}:`, err);
    });
}

export function removeIndexedDbItem(key: string): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve();
  }
  return initSetupDB()
    .then((db) => {
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.delete(key);
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      });
    })
    .catch((err) => {
      console.error(`Error deleting IndexedDB item ${key}:`, err);
    });
}

export async function clearAllSetupFlags(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return;
  }
  const db = await initSetupDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export const SETUP_STORAGE_KEYS = [
  'KalderaShield_is_setup',
  'KalderaShield_account_secret_profile',
  'KalderaShield_account_secret_key_remembered',
  'kalderashield_fallback',
  'KalderaShield_vault_storage_active_backend'
];

/**
 * Initializes the setup flags storage by reading all known keys from IndexedDB
 * in a single transaction and populating the synchronous in-memory cache.
 * Mirrors values to localStorage for instant synchronous reads on cold starts.
 */
export async function initializeIndexedDbStorage(): Promise<void> {
  const keys = SETUP_STORAGE_KEYS;

  // Batch-read all keys in a single IndexedDB transaction
  let dbValues: Map<string, string | null>;
  try {
    const db = await initSetupDB();
    dbValues = await new Promise<Map<string, string | null>>((resolve, reject) => {
      const results = new Map<string, string | null>();
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      for (const key of keys) {
        const request = store.get(key);
        request.onsuccess = () => {
          results.set(key, request.result !== undefined ? request.result : null);
        };
      }

      transaction.oncomplete = () => {
        db.close();
        resolve(results);
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    });
  } catch (err) {
    console.error('Failed to batch-read IndexedDB keys:', err);
    dbValues = new Map(keys.map(k => [k, null]));
  }

  // Populate in-memory cache and keep localStorage in sync
  const migrationWrites: Promise<void>[] = [];
  for (const key of keys) {
    const dbVal = dbValues.get(key) ?? null;
    if (dbVal !== null) {
      inMemoryCache[key] = dbVal;
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(key, dbVal);
          reportLocalMirrorWriteSuccess(key);
        } catch (error) {
          // O-2: was `catch {}`. Keeping IndexedDB authoritative is right, but
          // the localStorage copy is now behind and nothing said so.
          reportLocalMirrorWriteFailure(key, error);
        }
      }
    } else {
      const legacyVal = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      if (legacyVal !== null) {
        migrationWrites.push(setIndexedDbItem(key, legacyVal));
        inMemoryCache[key] = legacyVal;
      } else {
        inMemoryCache[key] = null;
      }
    }
  }

  // Fire-and-forget legacy migration writes (they go to IDB in background)
  if (migrationWrites.length > 0) {
    Promise.all(migrationWrites).catch((err) => {
      console.error('Legacy localStorage migration writes failed:', err);
    });
  }
}

/**
 * Synchronously retrieves a setup flag from the in-memory cache.
 * Falls back to localStorage if cache value is not found (useful during tests or early boot).
 */
export function getIndexedDbItemSync(key: string): string | null {
  if (inMemoryCache[key] !== undefined) {
    return inMemoryCache[key];
  }
  return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
}

/**
 * Synchronously sets a setup flag in the cache, mirrors to localStorage, and triggers an asynchronous write to IndexedDB.
 */
export function setIndexedDbItemSync(key: string, value: string): void {
  inMemoryCache[key] = value;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
      reportLocalMirrorWriteSuccess(key);
    } catch (error) {
      // O-2: was `catch {}`, with only a bare `// ignore`. See the note on
      // `failedLocalMirrorWrites`.
      reportLocalMirrorWriteFailure(key, error);
    }
  }
  setIndexedDbItem(key, value).catch((err) => {
    console.error(`Failed to write setup flag ${key} to IndexedDB:`, err);
  });
}

/**
 * Synchronously removes a setup flag from the cache and localStorage, and triggers an asynchronous delete in IndexedDB.
 */
export function removeIndexedDbItemSync(key: string): void {
  inMemoryCache[key] = null;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
  removeIndexedDbItem(key).catch((err) => {
    console.error(`Failed to remove setup flag ${key} from IndexedDB:`, err);
  });
}

/**
 * Synchronously clears all setup flags in the cache and localStorage, and triggers an asynchronous clear in IndexedDB.
 */
export function clearAllSetupFlagsSync(): void {
  Object.keys(inMemoryCache).forEach((key) => {
    inMemoryCache[key] = null;
  });
  if (typeof localStorage !== 'undefined') {
    try {
      for (const key of SETUP_STORAGE_KEYS) {
        localStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
  }
  clearAllSetupFlags().catch((err) => {
    console.error('Failed to clear setup flags from IndexedDB:', err);
  });
}
