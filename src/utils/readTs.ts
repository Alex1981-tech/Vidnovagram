// Per-contact read-timestamp bookkeeping. Stored in localStorage under a single
// JSON map keyed by "<clientId>::<accountId or 'all'>".

const READ_TS_KEY = 'vidnovagram_read_ts'

export function makeReadTsKey(clientId: string, accountId?: string): string {
  return `${clientId}::${(accountId || 'all').trim() || 'all'}`
}

export function getReadTs(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(READ_TS_KEY) || '{}')
  } catch {
    return {}
  }
}

export function setReadTs(clientId: string, ts: string, accountId?: string): void {
  const all = getReadTs()
  all[makeReadTsKey(clientId, accountId)] = ts
  localStorage.setItem(READ_TS_KEY, JSON.stringify(all))
}
