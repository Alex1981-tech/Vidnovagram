// Meta API client (Facebook Messenger + Instagram Direct).
// Backend endpoints under /api/meta/.

import { authFetch } from './authFetch'
import type { MetaAccount, MetaMessage } from '../types'
import { API_BASE } from '../constants'

export interface MetaAccountsResponse {
  results: MetaAccount[]
}

export async function fetchMetaAccounts(token: string): Promise<MetaAccount[]> {
  const r = await authFetch(`${API_BASE}/meta/accounts/`, token)
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

// One row per distinct sender (PSID/IGSID) the operator has chatted
// with on a given Meta account. Mirrors the shape of /business/contacts/
// so it slots into the same VG sidebar list rendering.
export interface MetaContactSummary {
  client_id: string         // synthetic: "meta:<account_id>:<sender_id>"
  sender_id: string
  account_id: string
  phone: string
  full_name: string
  linked_client_id: string | null
  is_linked: boolean
  last_message: string
  last_message_date: string | null
  last_direction: 'sent' | 'received' | ''
  unread: number
  source: 'meta'
  media_type: string
}

export async function fetchMetaContacts(
  token: string,
  account_id: string,
): Promise<MetaContactSummary[]> {
  const qs = new URLSearchParams({ account_id })
  const r = await authFetch(`${API_BASE}/meta/contacts/?${qs.toString()}`, token)
  if (!r.ok) throw new Error(`fetchMetaContacts ${r.status}`)
  const data = await r.json() as { contacts: MetaContactSummary[] }
  return data.contacts || []
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
  const r = await authFetch(`${API_BASE}/meta/messages/?${qs.toString()}`, token)
  if (!r.ok) throw new Error(`fetchMetaMessages ${r.status}`)
  return r.json()
}

export interface SendMetaMessageBody {
  recipient_id: string
  text?: string
  media_url?: string
  media_type?: string
  attachment_id?: string         // from prior /api/meta/upload/
  reply_to_msg_id?: string
  // FB Messenger only: required when last incoming is older than 24h.
  // One of HUMAN_AGENT / ACCOUNT_UPDATE / CONFIRMED_EVENT_UPDATE /
  // POST_PURCHASE_UPDATE. Backend defaults to messaging_type=RESPONSE
  // when not set, which only works inside the 24h window.
  message_tag?: 'HUMAN_AGENT' | 'ACCOUNT_UPDATE' | 'CONFIRMED_EVENT_UPDATE' | 'POST_PURCHASE_UPDATE'
}

export interface MetaUploadResponse {
  // FB Messenger response carries attachment_id (Meta's reusable id).
  attachment_id?: string
  // IG response carries media_url (signed, public via cc.vidnova.app).
  media_url?: string
  media_type: 'image' | 'video' | 'audio' | 'file'
  stored_path?: string
}

/** Upload a file for Meta DM. Backend picks the right strategy:
 *    FB Messenger → calls Meta's message_attachments → returns
 *      { attachment_id, media_type }
 *    Instagram   → saves to our /media + signs URL → returns
 *      { media_url, media_type } — Meta will fetch this URL when
 *      we POST to /me/messages with attachment.payload.url.
 *  Caller passes whichever field came back as the matching field on
 *  sendMetaMessage().
 */
export async function uploadMetaAttachment(
  token: string,
  account_id: string,
  file: File,
  media_type?: 'image' | 'video' | 'audio' | 'file',
): Promise<MetaUploadResponse> {
  const fd = new FormData()
  fd.append('file', file)
  if (media_type) fd.append('media_type', media_type)
  // authFetch sets Authorization but lets the browser fill the
  // multipart Content-Type with boundary itself.
  const r = await authFetch(`${API_BASE}/meta/upload/${account_id}/`, token, {
    method: 'POST',
    body: fd,
  })
  if (!r.ok) {
    const errText = await r.text().catch(() => '')
    throw new Error(`uploadMetaAttachment ${r.status}: ${errText.slice(0, 200)}`)
  }
  return r.json()
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
  const r = await authFetch(`${API_BASE}/meta/send/${account_id}/`, token, {
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
