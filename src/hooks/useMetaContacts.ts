import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchMetaContacts, type MetaContactSummary } from '../utils/metaApi'

/** Loads the list of distinct senders on a Meta account.
 *  Re-fetches when accountId changes. Exposes refresh() for the
 *  WebSocket handler to call after a `meta.message` event lands.
 */
export function useMetaContacts(accountId: string | null, token: string | null) {
  const [contacts, setContacts] = useState<MetaContactSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Cancels stale requests if the user switches account quickly.
  const lastReqRef = useRef(0)

  const refresh = useCallback(async () => {
    if (!accountId || !token) {
      setContacts([])
      return
    }
    const myReq = ++lastReqRef.current
    setLoading(true)
    setError(null)
    try {
      const data = await fetchMetaContacts(token, accountId)
      if (myReq !== lastReqRef.current) return // stale, newer one in flight
      setContacts(data)
    } catch (e) {
      if (myReq !== lastReqRef.current) return
      setError((e as Error).message)
      setContacts([])
    } finally {
      if (myReq === lastReqRef.current) setLoading(false)
    }
  }, [accountId, token])

  useEffect(() => { refresh() }, [refresh])

  return { contacts, loading, error, refresh, setContacts }
}
