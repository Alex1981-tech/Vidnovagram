// IndexedDB cache layer used for media blobs (thumbnails, avatars) and for
// JSON payloads (cached contact lists, chat messages).
//
// Interim location: top-level `src/cache.ts`. Feature-domain wrappers
// (`getThumb`, `getAvatar`, `getCachedMessages`, `getCachedContacts`) will
// live under `src/features/messenger/cache/` once feature folders land.

const CACHE_DB_NAME = 'vidnovagram_cache'
const CACHE_DB_VERSION = 3

export const THUMB_STORE = 'thumbnails'   // key: mediaPath, value: { blob, type, ts }
export const AVATAR_STORE = 'avatars'     // key: clientId, value: { blob, type, ts }
export const MSG_STORE = 'messages'       // key: clientId, value: { messages, count, ..., ts }
export const CONTACTS_STORE = 'contacts'  // key: accountId|'all', value: { contacts, count, ts }

export const CACHE_TTL = 7 * 24 * 60 * 60 * 1000       // 7 days (media blobs)
export const MSG_CACHE_TTL = 24 * 60 * 60 * 1000       // 24 hours (JSON payloads)

export function openCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION)
    req.onupgradeneeded = (event) => {
      const db = req.result
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion
      if (!db.objectStoreNames.contains(THUMB_STORE)) db.createObjectStore(THUMB_STORE)
      if (!db.objectStoreNames.contains(AVATAR_STORE)) db.createObjectStore(AVATAR_STORE)
      if (!db.objectStoreNames.contains(MSG_STORE)) db.createObjectStore(MSG_STORE)
      if (!db.objectStoreNames.contains(CONTACTS_STORE)) db.createObjectStore(CONTACTS_STORE)
      // Clear stale message/contact caches on schema upgrade
      // (adds reply_to_*, reaction context)
      if (oldVersion > 0 && oldVersion < 3) {
        const tx = (event.target as IDBOpenDBRequest).transaction!
        try { tx.objectStore(MSG_STORE).clear() } catch (_) { /* ignore */ }
        try { tx.objectStore(CONTACTS_STORE).clear() } catch (_) { /* ignore */ }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Read a cached media blob. Returns a blob URL if present and not expired. */
export async function getCached(store: string, key: string): Promise<string | null> {
  try {
    const db = await openCacheDB()
    return new Promise((resolve) => {
      const tx = db.transaction(store, 'readonly')
      const req = tx.objectStore(store).get(key)
      req.onsuccess = () => {
        const val = req.result
        if (val && (Date.now() - val.ts) < CACHE_TTL) {
          const blob = new Blob([val.blob], { type: val.type || 'image/jpeg' })
          resolve(URL.createObjectURL(blob))
        } else {
          resolve(null)
        }
      }
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

/** Persist a media blob. */
export async function putCache(store: string, key: string, blob: Blob): Promise<void> {
  try {
    const ab = await blob.arrayBuffer()
    const db = await openCacheDB()
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put({ blob: ab, type: blob.type, ts: Date.now() }, key)
  } catch {
    // best-effort
  }
}

/** Read a cached JSON payload. */
export async function getJsonCache<T>(
  store: string,
  key: string,
  ttl: number = MSG_CACHE_TTL,
): Promise<T | null> {
  try {
    const db = await openCacheDB()
    return new Promise((resolve) => {
      const tx = db.transaction(store, 'readonly')
      const req = tx.objectStore(store).get(key)
      req.onsuccess = () => {
        const val = req.result
        if (val && (Date.now() - val.ts) < ttl) {
          resolve(val as T)
        } else {
          resolve(null)
        }
      }
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

/** Persist a JSON payload; the `ts` field is appended automatically. */
export async function putJsonCache(
  store: string,
  key: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const db = await openCacheDB()
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put({ ...data, ts: Date.now() }, key)
  } catch {
    // best-effort
  }
}
