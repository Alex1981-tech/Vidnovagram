import { useEffect, useState } from 'react'
import { API_BASE } from '../constants'
import { ContactProfileEditor } from './ContactProfileEditor'

interface Appointment {
  id: string
  date: string
  doctor_name: string
  clinic_name: string
  procedure: string
  status: string
}

interface BusinessProfile {
  client_id: string
  phone: string
  full_name: string
  provider: string
  account_label: string
  tg_photo_url?: string
  tg_username?: string
  tg_chat_id?: number
  is_new_patient?: boolean
  baf_card_number?: string
  bonus_balance?: number
  birth_date?: string
  upcoming_appointments?: Appointment[]
  recent_appointments?: Appointment[]
}

interface Props {
  clientId: string
  accountId: string
  token: string
  open: boolean
  contactProfileId?: string | null
}

function formatDate(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleString('uk-UA', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

function formatHryvnia(n: number): string {
  return new Intl.NumberFormat('uk-UA').format(n) + ' грн'
}

export function BusinessContactCard({ clientId, accountId, token, open, contactProfileId }: Props) {
  const [profile, setProfile] = useState<BusinessProfile | null>(null)
  const [loading, setLoading] = useState(false)

  // Skip the BusinessProfile fetch for synthetic "bot:<uuid>" client_ids —
  // those have no Client row, the legacy endpoint would 404. The CRM
  // editor below still renders against the supplied contactProfileId.
  const isSynthetic = typeof clientId === 'string' && clientId.startsWith('bot:')

  useEffect(() => {
    if (!open || !clientId || !accountId || !token || isSynthetic) return
    let cancelled = false
    setLoading(true)
    const url = `${API_BASE}/business/contacts/${clientId}/profile/?account_id=${accountId}`
    fetch(url, { headers: { Authorization: `Token ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data) return
        setProfile(data.profile || null)
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, clientId, accountId, token, isSynthetic])

  if (!open) return null
  // For unlinked profiles we show only the CRM editor — no business
  // appointments / bonuses to fetch since there's no Client.
  if (!profile && !loading && !contactProfileId) return null

  return (
    <div className="business-profile">
      {loading && !profile && (
        <div className="business-profile-empty">Завантаження…</div>
      )}
      {profile && (
        <>
          <div className="business-profile-top">
            {profile.is_new_patient && (
              <span className="badge-new-patient-big">🆕 Новий клієнт</span>
            )}
            {profile.baf_card_number && (
              <span className="badge-card">Картка № {profile.baf_card_number}</span>
            )}
            {typeof profile.bonus_balance === 'number' && profile.bonus_balance > 0 && (
              <span className="badge-bonus">💰 {formatHryvnia(profile.bonus_balance)}</span>
            )}
          </div>
          {profile.tg_username && (
            <div className="business-profile-row">
              <span className="label">Telegram</span>
              <span>@{profile.tg_username}</span>
            </div>
          )}
          {profile.upcoming_appointments && profile.upcoming_appointments.length > 0 && (
            <div className="business-profile-section">
              <div className="business-profile-section-title">📅 Найближчі прийоми</div>
              {profile.upcoming_appointments.slice(0, 3).map(a => (
                <div key={a.id} className="business-appt">
                  <span className="business-appt-date">{formatDate(a.date)}</span>
                  <span className="business-appt-info">
                    {a.procedure || 'Прийом'} у {a.doctor_name || 'лікаря'}
                  </span>
                </div>
              ))}
            </div>
          )}
          {profile.recent_appointments && profile.recent_appointments.length > 0 && (
            <div className="business-profile-section">
              <div className="business-profile-section-title">Останні візити</div>
              {profile.recent_appointments.slice(0, 3).map(a => (
                <div key={a.id} className="business-appt business-appt-past">
                  <span className="business-appt-date">{formatDate(a.date)}</span>
                  <span className="business-appt-info">
                    {a.procedure || 'Прийом'} ({a.status})
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {contactProfileId && (
        <ContactProfileEditor
          contactProfileId={contactProfileId}
          token={token}
        />
      )}
    </div>
  )
}
