// Loads MetaAccount list (FB Messenger + Instagram Direct) and refreshes on demand.
// Real-time MetaMessage events arrive through useMessengerWebSocket — this hook
// only owns the account list state.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { MetaAccount } from '../types'
import { fetchMetaAccounts } from '../utils/metaApi'

export function useMetaAccounts(token: string | null) {
  const [accounts, setAccounts] = useState<MetaAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetchedOnce = useRef(false)

  const refresh = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const list = await fetchMetaAccounts(token)
      setAccounts(list)
      fetchedOnce.current = true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (token && !fetchedOnce.current) {
      refresh()
    }
  }, [token, refresh])

  return { accounts, loading, error, refresh, setAccounts }
}
