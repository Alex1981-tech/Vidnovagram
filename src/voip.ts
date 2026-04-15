/**
 * VoIP API for Vidnovagram.
 *
 * Audio is P2P via Telegram (MadelineProto native VoIP).
 * Vidnovagram only controls call state — no local audio streaming.
 * Recording is handled server-side by MadelineProto ($call->setOutput).
 */

const API_BASE = 'https://cc.vidnova.app'

export interface VoIPCall {
  id: number
  tg_account_id: string | null
  direction: 'outgoing' | 'incoming'
  state: 'ringing' | 'connecting' | 'connected' | 'ended'
  tg_peer_id: number
  peer_phone: string
  peer_name: string
  mp_call_id: string
  started_at: string | null
  answered_at: string | null
  ended_at: string | null
  end_reason: string
  recording_duration_seconds: number | null
}

type AuthFetchFn = (url: string, init?: RequestInit) => Promise<Response>

// ---------------------------------------------------------------------------
// VoIP API
// ---------------------------------------------------------------------------

export async function voipCall(
  authFetch: AuthFetchFn,
  accountId: string,
  peerId: number,
): Promise<VoIPCall> {
  const resp = await authFetch(`${API_BASE}/api/telegram/voip/call/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: accountId, peer_id: peerId }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }))
    throw new Error(err.error || resp.statusText)
  }
  return resp.json()
}

export async function voipAnswer(
  authFetch: AuthFetchFn,
  callId: string | number,
): Promise<VoIPCall> {
  const resp = await authFetch(`${API_BASE}/api/telegram/voip/answer/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ call_id: callId }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }))
    throw new Error(err.error || resp.statusText)
  }
  return resp.json()
}

export async function voipHangup(
  authFetch: AuthFetchFn,
  callId: string | number,
): Promise<VoIPCall> {
  const resp = await authFetch(`${API_BASE}/api/telegram/voip/hangup/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ call_id: callId }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }))
    throw new Error(err.error || resp.statusText)
  }
  return resp.json()
}

export async function voipGetActive(
  authFetch: AuthFetchFn,
): Promise<VoIPCall[]> {
  const resp = await authFetch(`${API_BASE}/api/telegram/voip/active/`)
  if (!resp.ok) return []
  return resp.json()
}
