/**
 * Local SQLite cache for chat messages.
 *
 * Why SQLite on top of IndexedDB:
 * - IndexedDB stored only the last 200 messages per chat as a single
 *   JSON blob. Re-opening a chat past that window required a network
 *   roundtrip, and full-history search was impossible offline.
 * - SQLite gives us indexed lookups, unlimited history per chat,
 *   substring search across every received/sent message, and survives
 *   schema changes via Tauri migrations.
 *
 * Layout: one `messages` table, keyed (remote_id, account_id, channel)
 * for upserts. The full ChatMessage payload is stored in `raw_json`
 * so we can return rich messages without rebuilding the type from
 * normalized columns. Hot fields (text, has_media, message_date) are
 * mirrored as columns for indexing/search.
 *
 * The plugin runs SQLite in the Rust process and exposes async
 * select/execute over Tauri IPC. All calls here are best-effort:
 * when running outside the Tauri shell (vitest, dev browser) Database
 * is undefined and helpers no-op.
 */
import type { ChatMessage } from './types'

// Lazy-imported so non-Tauri builds (vitest, browser preview) don't
// crash on the missing window.__TAURI__ runtime.
let dbPromise: Promise<import('@tauri-apps/plugin-sql').default | null> | null = null

async function getDb() {
  if (dbPromise) return dbPromise
  dbPromise = (async () => {
    try {
      const mod = await import('@tauri-apps/plugin-sql')
      const Database = mod.default
      // The migration registered in src-tauri/src/lib.rs creates the
      // `messages` table on first load.
      return await Database.load('sqlite:vidnovagram.db')
    } catch (e) {
      console.warn('[db] SQLite unavailable, falling back to no-op:', e)
      return null
    }
  })()
  return dbPromise
}

interface MsgRow {
  raw_json: string
}

/** Insert/update a batch of chat messages for one (client_id, account_id, channel). */
export async function saveMessages(
  clientId: string,
  accountId: string,
  channel: 'tg' | 'wa' | 'business' | 'meta',
  messages: ChatMessage[],
): Promise<void> {
  if (!messages.length) return
  const db = await getDb()
  if (!db) return

  // SQLite best practice: wrap many inserts in a transaction.
  try {
    await db.execute('BEGIN')
    for (const m of messages) {
      const remoteId = String(m.id ?? '')
      if (!remoteId) continue
      await db.execute(
        `INSERT INTO messages
          (remote_id, client_id, account_id, channel, message_date, direction,
           text, has_media, media_type, media_file, thumbnail, sender_name, raw_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT(remote_id, account_id, channel) DO UPDATE SET
           message_date = excluded.message_date,
           direction    = excluded.direction,
           text         = excluded.text,
           has_media    = excluded.has_media,
           media_type   = excluded.media_type,
           media_file   = excluded.media_file,
           thumbnail    = excluded.thumbnail,
           sender_name  = excluded.sender_name,
           raw_json     = excluded.raw_json`,
        [
          remoteId,
          clientId,
          accountId || '',
          channel,
          m.message_date,
          (m as { direction?: string }).direction || '',
          (m as { text?: string }).text || '',
          (m as { has_media?: boolean }).has_media ? 1 : 0,
          (m as { media_type?: string }).media_type || '',
          (m as { media_file?: string }).media_file || '',
          (m as { thumbnail?: string }).thumbnail || '',
          (m as { sender_name?: string }).sender_name || '',
          JSON.stringify(m),
        ],
      )
    }
    await db.execute('COMMIT')
  } catch (e) {
    try { await db.execute('ROLLBACK') } catch { /* ignore */ }
    console.warn('[db] saveMessages failed:', e)
  }
}

/** Read up to `limit` newest messages for a chat from local cache. */
export async function loadCachedMessages(
  clientId: string,
  accountId: string,
  limit = 500,
): Promise<ChatMessage[]> {
  const db = await getDb()
  if (!db) return []
  try {
    const rows = await db.select<MsgRow[]>(
      `SELECT raw_json FROM messages
       WHERE client_id = $1 AND (account_id = $2 OR $2 = '')
       ORDER BY message_date DESC
       LIMIT $3`,
      [clientId, accountId || '', limit],
    )
    // Reverse to chronological (oldest first) — UI expects ascending.
    return rows.map(r => JSON.parse(r.raw_json) as ChatMessage).reverse()
  } catch (e) {
    console.warn('[db] loadCachedMessages failed:', e)
    return []
  }
}

/** Substring search across all stored messages, optionally scoped to an account. */
export async function searchMessages(
  query: string,
  accountId?: string,
  limit = 50,
): Promise<Array<ChatMessage & { client_id: string; account_id: string }>> {
  const db = await getDb()
  if (!db || !query.trim()) return []
  try {
    const params: (string | number)[] = [`%${query}%`, limit]
    let sql = `SELECT raw_json, client_id, account_id FROM messages
               WHERE text LIKE $1`
    if (accountId) {
      sql += ' AND account_id = $3'
      params.push(accountId)
    }
    sql += ' ORDER BY message_date DESC LIMIT $2'
    const rows = await db.select<Array<{ raw_json: string; client_id: string; account_id: string }>>(sql, params)
    return rows.map(r => ({
      ...(JSON.parse(r.raw_json) as ChatMessage),
      client_id: r.client_id,
      account_id: r.account_id,
    }))
  } catch (e) {
    console.warn('[db] searchMessages failed:', e)
    return []
  }
}

/** Delete cached messages older than N days. Call from a maintenance task. */
export async function pruneOldMessages(daysToKeep = 365): Promise<number> {
  const db = await getDb()
  if (!db) return 0
  try {
    const cutoff = new Date(Date.now() - daysToKeep * 86400_000).toISOString()
    const result = await db.execute(
      `DELETE FROM messages WHERE message_date < $1`,
      [cutoff],
    )
    return result.rowsAffected ?? 0
  } catch (e) {
    console.warn('[db] pruneOldMessages failed:', e)
    return 0
  }
}
