import { useCallback, useEffect, useRef, useState } from 'react'
import * as telemetry from '../telemetry'
import { API_BASE } from '../constants'
import { authFetch } from '../utils/authFetch'
import { AVATAR_STORE, CONTACTS_STORE, getCached, getJsonCache, putCache, putJsonCache } from '../cache'
import type { Contact } from '../types'

// Monotonic request id so stale responses from earlier accounts are dropped.
let contactsReqSeq = 0

export interface UseContactsOptions {
  token: string | undefined
  account: string
  search: string
  onUnauthorized: () => void
  /** photoMap lives in App to feed other UI. Hook reads it to skip re-fetching avatars. */
  photoMap: Record<string, string>
  setPhotoMap: React.Dispatch<React.SetStateAction<Record<string, string>>>
  setPeerPresence: React.Dispatch<React.SetStateAction<Record<number, { status: string; was_online: number | null }>>>
}

export interface ContactsController {
  contacts: Contact[]
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>
  contactCount: number
  contactPage: number
  hasMore: boolean
  loadingMore: boolean
  loadContacts: () => Promise<void>
  loadMoreContacts: () => Promise<void>
}

async function fetchAndCacheAvatars(
  ids: string,
  token: string,
  photoMapRef: React.RefObject<Record<string, string>>,
  setPhotoMap: UseContactsOptions['setPhotoMap'],
) {
  const photoMap = photoMapRef.current || {}
  try {
    const pr = await authFetch(`${API_BASE}/telegram/photos-map/?ids=${ids}`, token)
    if (!pr.ok) return
    const pm: Record<string, string> = await pr.json()
    for (const [cid, path] of Object.entries(pm)) {
      if (photoMap[cid]) continue
      authFetch(`${API_BASE.replace('/api', '')}${path}`, token)
        .then(r => (r.ok ? r.blob() : null))
        .then(blob => {
          if (blob) {
            putCache(AVATAR_STORE, cid, blob)
            setPhotoMap(prev => ({ ...prev, [cid]: URL.createObjectURL(blob) }))
          }
        })
        .catch(() => {})
    }
  } catch {
    // ignore
  }
}

/**
 * Contacts list with cache-first load, search, and infinite scroll.
 * Side effects per page:
 *  - IndexedDB contacts cache (default view only)
 *  - avatar blobs (IndexedDB + /telegram/photos-map/ + blob fetch)
 *  - presence snapshot (/telegram/presence/)
 *
 * All cross-domain setters (setPhotoMap, setPeerPresence) are passed in so
 * App keeps ownership of those maps for other consumers.
 */
export function useContacts(opts: UseContactsOptions): ContactsController {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactCount, setContactCount] = useState(0)
  const [contactPage, setContactPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const { token, account, search, onUnauthorized, photoMap, setPhotoMap, setPeerPresence } = opts

  // Keep a stable ref to photoMap so loadContacts/loadMoreContacts don't
  // re-identity on every avatar arrival (avoids re-render loops via useEffect
  // deps on loadContacts).
  const photoMapRef = useRef(photoMap)
  useEffect(() => { photoMapRef.current = photoMap })

  const loadContacts = useCallback(async () => {
    if (!token) return
    const cacheKey = `${account || 'all'}_${search || ''}`
    // Tag this request; any response whose tag is not the latest is a stale
    // fetch from a previous account/search and must be dropped.
    const reqId = ++contactsReqSeq
    const requestedAccount = account

    // Phase 0: instant load from cache (only for no-search default view)
    if (!search) {
      const cached = await getJsonCache<{ contacts: Contact[]; count: number }>(CONTACTS_STORE, cacheKey)
      if (cached && reqId === contactsReqSeq) {
        setContacts(cached.contacts)
        setContactCount(cached.count)
      }
    }

    try {
      const params = new URLSearchParams({ per_page: '50' })
      if (search) params.set('search', search)
      if (account) params.set('account', account)
      const resp = await authFetch(`${API_BASE}/telegram/contacts/?${params}`, token)
      if (reqId !== contactsReqSeq) return  // stale
      if (resp.status === 401) {
        onUnauthorized()
        return
      }
      if (!resp.ok) return

      const data = await resp.json()
      if (reqId !== contactsReqSeq) return  // stale after json parse
      // Double-check account hasn't changed under us (defensive)
      if (requestedAccount !== account) return
      const list: Contact[] = data.results || []
      setContacts(list)
      setContactCount(data.count || 0)
      setContactPage(1)
      // Page-based pagination: more to load if we haven't covered the total.
      // Don't gate on list.length — backend deduplicates TG+WA per client so
      // a single page can arrive with fewer than `per_page` items even when
      // more pages exist.
      const perPage = data.per_page || 50
      const total = data.count || 0
      setHasMore(1 * perPage < total)

      if (search) telemetry.trackSearch(search.length, data.count || 0)

      if (!search) {
        putJsonCache(CONTACTS_STORE, cacheKey, { contacts: list, count: data.count || 0 })
      }

      // Avatar: IndexedDB first, then /photos-map/.
      const ids = list.map(c => c.client_id).join(',')
      if (ids) {
        const current = photoMapRef.current || {}
        for (const c of list) {
          if (current[c.client_id]) continue
          getCached(AVATAR_STORE, c.client_id).then(url => {
            if (url) setPhotoMap(prev => (prev[c.client_id] ? prev : { ...prev, [c.client_id]: url }))
          })
        }
        await fetchAndCacheAvatars(ids, token, photoMapRef, setPhotoMap)
      }

      // Presence for peers that have tg_peer_id, but only in a single-account view.
      const peerIds = list.filter(c => c.tg_peer_id).map(c => c.tg_peer_id as number)
      if (peerIds.length > 0 && account) {
        try {
          const presResp = await authFetch(
            `${API_BASE}/telegram/presence/?account_id=${account}&peer_ids=${peerIds.join(',')}`,
            token,
          )
          if (presResp.ok) {
            const presData = await presResp.json()
            if (Array.isArray(presData) && presData.length > 0) {
              setPeerPresence(prev => {
                const next = { ...prev }
                for (const p of presData) {
                  next[p.tg_peer_id] = {
                    status: p.status || 'unknown',
                    was_online: p.last_seen_at ? Math.floor(new Date(p.last_seen_at).getTime() / 1000) : null,
                  }
                }
                return next
              })
            }
          }
        } catch {
          // ignore
        }
      }
    } catch (e) {
      console.error('Contacts:', e)
    }
  }, [token, account, search, onUnauthorized, setPhotoMap, setPeerPresence])

  const loadMoreContacts = useCallback(async () => {
    if (!token || loadingMore || !hasMore) return
    const nextPage = contactPage + 1
    setLoadingMore(true)
    const reqId = ++contactsReqSeq
    const requestedAccount = account
    try {
      const params = new URLSearchParams({ per_page: '50', page: String(nextPage) })
      if (search) params.set('search', search)
      if (account) params.set('account', account)
      const resp = await authFetch(`${API_BASE}/telegram/contacts/?${params}`, token)
      if (reqId !== contactsReqSeq || requestedAccount !== account) return
      if (resp.ok) {
        const data = await resp.json()
        if (reqId !== contactsReqSeq || requestedAccount !== account) return
        const list: Contact[] = data.results || []
        setContacts(prev => [...prev, ...list])
        setContactPage(nextPage)
        const perPage = data.per_page || 50
        const total = data.count || 0
        setHasMore(nextPage * perPage < total)

        const ids = list.map(c => c.client_id).join(',')
        if (ids) {
          await fetchAndCacheAvatars(ids, token, photoMapRef, setPhotoMap)
        }
      }
    } catch (e) {
      console.error('Load more contacts:', e)
    } finally {
      setLoadingMore(false)
    }
  }, [token, loadingMore, hasMore, contactPage, search, account, setPhotoMap])

  return {
    contacts,
    setContacts,
    contactCount,
    contactPage,
    hasMore,
    loadingMore,
    loadContacts,
    loadMoreContacts,
  }
}
