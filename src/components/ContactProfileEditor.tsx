import { useEffect, useState, useCallback } from 'react'
import { API_BASE } from '../constants'
import { authFetch } from '../utils/authFetch'

/** CRM editor — read + write ContactProfile fields directly from VG.
 *  Lives inside BusinessContactCard / ContactProfileModal for any
 *  contact that has `contact_profile_id` (which is now everyone in
 *  the bot rail, both linked and unlinked).
 *
 *  Iter 3 of CRM_ContactProfile_Plan. Saving via PATCH; phone changes
 *  trigger a check-phone lookup and an inline confirm-merge flow.
 */

interface ContactProfile {
  id: string
  client: string | null
  client_full_name: string
  client_phone: string
  display_name: string
  phone: string
  email: string
  birth_date: string | null
  notes: string
  stage: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost'
  source_type: string
  is_linked: boolean
  is_anonymized: boolean
  created_at: string
  updated_at: string
}

interface MatchedClient {
  id: string
  full_name: string
  phone: string
}

const STAGE_LABELS: Record<ContactProfile['stage'], string> = {
  new: 'Новий',
  contacted: 'Звʼязалися',
  qualified: 'Кваліфікований',
  converted: 'Пацієнт',
  lost: 'Втрачено',
}

const STAGE_COLORS: Record<ContactProfile['stage'], string> = {
  new: '#94a3b8',
  contacted: '#0ea5e9',
  qualified: '#a855f7',
  converted: '#10b981',
  lost: '#ef4444',
}

interface Props {
  contactProfileId: string
  token: string
}

export function ContactProfileEditor({ contactProfileId, token }: Props) {
  const [profile, setProfile] = useState<ContactProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  // Local form state — only flushed to backend on Save click
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [notes, setNotes] = useState('')
  const [stage, setStage] = useState<ContactProfile['stage']>('new')

  // Match-by-phone confirm modal
  const [matchedClient, setMatchedClient] = useState<MatchedClient | null>(null)
  const [otherProfileId, setOtherProfileId] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const refresh = useCallback(async () => {
    if (!contactProfileId || !token) return
    setLoading(true)
    setError(null)
    try {
      const r = await authFetch(`${API_BASE}/contacts/${contactProfileId}/`, token)
      if (!r.ok) {
        setError(`Не вдалося завантажити (HTTP ${r.status})`)
        return
      }
      const data = await r.json() as ContactProfile
      setProfile(data)
      setDisplayName(data.display_name || '')
      setPhone(data.phone || '')
      setEmail(data.email || '')
      setBirthDate(data.birth_date || '')
      setNotes(data.notes || '')
      setStage(data.stage)
    } catch (e) {
      setError(`${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [contactProfileId, token])

  useEffect(() => { refresh() }, [refresh])

  const dirty = profile && (
    displayName !== (profile.display_name || '')
    || phone !== (profile.phone || '')
    || email !== (profile.email || '')
    || birthDate !== (profile.birth_date || '')
    || notes !== (profile.notes || '')
    || stage !== profile.stage
  )

  const checkPhone = useCallback(async () => {
    if (!contactProfileId || !phone || !token) return
    setChecking(true)
    setMatchedClient(null)
    setOtherProfileId(null)
    try {
      const r = await authFetch(
        `${API_BASE}/contacts/${contactProfileId}/check-phone/`,
        token,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        },
      )
      if (!r.ok) return
      const data = await r.json() as {
        matched_client?: MatchedClient | null
        other_profile_id?: string | null
        phone?: string
      }
      if (data.matched_client) {
        setMatchedClient(data.matched_client)
        setOtherProfileId(data.other_profile_id || null)
      }
      if (data.phone && data.phone !== phone) setPhone(data.phone)
    } finally {
      setChecking(false)
    }
  }, [contactProfileId, phone, token])

  const save = useCallback(async () => {
    if (!profile) return
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        display_name: displayName,
        phone,
        email,
        notes,
        stage,
      }
      if (birthDate) body.birth_date = birthDate
      else if (profile.birth_date) body.birth_date = null
      const r = await authFetch(
        `${API_BASE}/contacts/${contactProfileId}/`,
        token,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        setError(`Помилка збереження: ${JSON.stringify(e)}`)
        return
      }
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1800)
      await refresh()
      // After save — if phone is non-empty and we don't yet have a Client
      // attached, check whether one exists in DB so the manager sees the
      // confirm-merge banner.
      if (phone && !profile.client) await checkPhone()
    } finally {
      setSaving(false)
    }
  }, [profile, displayName, phone, email, birthDate, notes, stage, contactProfileId, token, refresh, checkPhone])

  const linkClient = useCallback(async () => {
    if (!matchedClient || !contactProfileId) return
    const r = await authFetch(
      `${API_BASE}/contacts/${contactProfileId}/link-client/`,
      token,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: matchedClient.id,
          merge_with_profile: otherProfileId || undefined,
        }),
      },
    )
    if (r.ok) {
      setMatchedClient(null)
      setOtherProfileId(null)
      await refresh()
    } else {
      const e = await r.json().catch(() => ({}))
      setError(`Не вдалося обʼєднати: ${JSON.stringify(e)}`)
    }
  }, [matchedClient, otherProfileId, contactProfileId, token, refresh])

  if (!contactProfileId) return null
  if (loading && !profile) {
    return <div className="cp-editor cp-editor-loading">Завантаження CRM-картки…</div>
  }
  if (error && !profile) {
    return <div className="cp-editor cp-editor-error">{error}</div>
  }
  if (!profile) return null

  return (
    <div className="cp-editor">
      <div className="cp-editor-header">
        <span className="cp-editor-title">CRM-картка</span>
        <span
          className="cp-editor-stage"
          style={{ background: STAGE_COLORS[stage] + '22', color: STAGE_COLORS[stage] }}
        >
          {STAGE_LABELS[stage]}
        </span>
      </div>

      <label className="cp-field">
        <span>Імʼя</span>
        <input
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="Імʼя для картки"
        />
      </label>

      <label className="cp-field">
        <span>Телефон</span>
        <div className="cp-row">
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+380…"
          />
          <button
            type="button"
            className="cp-btn-sm"
            onClick={checkPhone}
            disabled={!phone || checking}
            title="Перевірити чи такий пацієнт вже є в системі"
          >
            {checking ? '…' : 'Перевірити'}
          </button>
        </div>
      </label>

      {matchedClient && (
        <div className="cp-merge-banner">
          <div className="cp-merge-text">
            <strong>{matchedClient.full_name || matchedClient.phone}</strong> вже є в БД.
            Обʼєднати цей контакт із цим пацієнтом і перенести історію переписок?
          </div>
          <div className="cp-merge-actions">
            <button type="button" className="cp-btn-primary" onClick={linkClient}>
              Обʼєднати
            </button>
            <button
              type="button"
              className="cp-btn-sm"
              onClick={() => { setMatchedClient(null); setOtherProfileId(null) }}
            >
              Скасувати
            </button>
          </div>
        </div>
      )}

      {profile.client && (
        <div className="cp-linked-banner">
          ✓ Прив'язано: <strong>{profile.client_full_name || profile.client_phone}</strong>
        </div>
      )}

      <label className="cp-field">
        <span>Email</span>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="email@example.com"
        />
      </label>

      <label className="cp-field">
        <span>Дата народження</span>
        <input
          type="date"
          value={birthDate || ''}
          onChange={e => setBirthDate(e.target.value)}
        />
      </label>

      <label className="cp-field">
        <span>Стадія CRM</span>
        <select value={stage} onChange={e => setStage(e.target.value as ContactProfile['stage'])}>
          {Object.entries(STAGE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </label>

      <label className="cp-field">
        <span>Нотатки менеджера</span>
        <textarea
          rows={3}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Деталі, контекст, нагадування…"
        />
      </label>

      <div className="cp-footer">
        <button
          type="button"
          className="cp-btn-primary"
          onClick={save}
          disabled={!dirty || saving}
        >
          {saving ? 'Зберігаю…' : 'Зберегти'}
        </button>
        {savedFlash && <span className="cp-saved">✓ Збережено</span>}
        {error && <span className="cp-error">{error}</span>}
      </div>

      <div className="cp-footer-meta">
        Джерело: {profile.source_type} · оновлено {new Date(profile.updated_at).toLocaleString('uk-UA')}
      </div>
    </div>
  )
}
