import { TelegramIcon, WhatsAppIcon, ViberIcon, FacebookIcon, InstagramIcon, TelegramBotIcon } from './icons'

export interface PickableAccount {
  id: string
  source: string
  label: string
  phone: string
  last_message_date?: string | null
}

interface Props {
  open: boolean
  clientName: string
  accounts: PickableAccount[]
  onPick: (account: PickableAccount) => void
  onClose: () => void
}

function fmtDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function Icon({ source }: { source: string }) {
  switch (source) {
    case 'whatsapp':
    case 'whatsapp_cloud':
      return <WhatsAppIcon size={18} color="#25D366" />
    case 'viber':
    case 'viber_turbosms':
      return <ViberIcon size={18} />
    case 'telegram_bot':
      return <TelegramBotIcon size={18} />
    case 'facebook_messenger':
      return <FacebookIcon size={18} />
    case 'instagram_direct':
      return <InstagramIcon size={18} />
    default:
      return <TelegramIcon size={18} color="#2AABEE" />
  }
}

/**
 * Asks the operator which channel to open when the contact has conversations
 * in more than one account (TG / WA / Viber / FB / IG / TG-bot). Shown only
 * when the count is >1 — a single-channel contact opens directly.
 */
export function AccountPickerModal({ open, clientName, accounts, onPick, onClose }: Props) {
  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="forward-modal" onClick={e => e.stopPropagation()} style={{ minWidth: 420, maxWidth: 520 }}>
        <h3>Оберіть акаунт — {clientName || 'Клієнт'}</h3>
        <div style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', marginBottom: 8 }}>
          У цього контакта є листування у кількох каналах. Виберіть в якому відкрити чат:
        </div>
        <div className="account-picker-list">
          {accounts.map(a => (
            <button
              key={`${a.source}:${a.id}`}
              type="button"
              className="account-picker-item"
              onClick={() => onPick(a)}
            >
              <span className="account-picker-icon"><Icon source={a.source} /></span>
              <span className="account-picker-body">
                <span className="account-picker-label">{a.label}</span>
                <span className="account-picker-phone">{a.phone}</span>
              </span>
              <span className="account-picker-date">{fmtDate(a.last_message_date)}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="tpl-btn-secondary" onClick={onClose}>Скасувати</button>
        </div>
      </div>
    </div>
  )
}
