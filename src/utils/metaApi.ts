// Meta API client (Facebook Messenger + Instagram Direct).
// Backend endpoints under /api/meta/.

import { authFetch } from './authFetch'
import type { MetaAccount, MetaMessage } from '../types'
import { API_BASE } from '../constants'

export interface MetaAccountsResponse {
  results: MetaAccount[]
}

export async function fetchMetaAccounts(token: string): Promise<MetaAccount[]> {
  const r = await authFetch(`${API_BASE}/api/meta/accounts/`, token)
  if (!r.ok) throw new Error(`fetchMetaAccounts ${r.status}`)
  const data: MetaAccountsResponse = await r.json()
  return data.results || []
}

export interface MetaMessagesResponse {
  count?: number
  next?: string | null
  previous?: string | null
  results: MetaMessage[]
}

export async function fetchMetaMessages(
  token: string,
  params: {
    account_id?: string
    client_id?: string
    sender_id?: string
    before?: string
    page?: number
    page_size?: number
  } = {},
): Promise<MetaMessagesResponse> {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  })
  const r = await authFetch(`${API_BASE}/api/meta/messages/?${qs.toString()}`, token)
  if (!r.ok) throw new Error(`fetchMetaMessages ${r.status}`)
  return r.json()
}

export interface SendMetaMessageBody {
  recipient_id: string
  text?: string
  media_url?: string
  media_type?: string
  reply_to_msg_id?: string
}

export interface SendMetaMessageResponse {
  sent: boolean
  message: MetaMessage
}

export async function sendMetaMessage(
  token: string,
  account_id: string,
  body: SendMetaMessageBody,
): Promise<SendMetaMessageResponse> {
  const r = await authFetch(`${API_BASE}/api/meta/send/${account_id}/`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const errText = await r.text().catch(() => '')
    throw new Error(`sendMetaMessage ${r.status}: ${errText.slice(0, 200)}`)
  }
  return r.json()
}

// Group accounts by brand_group → ordered list of [brand, accounts[]].
// Connected accounts grouped per brand; needs_review (IG awaiting App Review) at end.
export function groupAccountsByBrand(
  accounts: MetaAccount[],
): { brand: string; accounts: MetaAccount[] }[] {
  const groups = new Map<string, MetaAccount[]>()
  for (const a of accounts) {
    const key = a.brand_group || 'Other'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(a)
  }
  // Sort brands alphabetically, "Other" last
  const sorted = [...groups.keys()].sort((x, y) => {
    if (x === 'Other') return 1
    if (y === 'Other') return -1
    return x.localeCompare(y, 'uk')
  })
  return sorted.map((brand) => ({
    brand,
    accounts: groups.get(brand)!.sort((a, b) => {
      // facebook first, then instagram within brand
      if (a.platform !== b.platform) return a.platform === 'facebook' ? -1 : 1
      return a.label.localeCompare(b.label, 'uk')
    }),
  }))
}
