import type { Dispatch, SetStateAction } from 'react'
import { TelegramIcon, WhatsAppIcon, GmailIcon, ViberIcon, FacebookIcon, InstagramIcon, TelegramBotIcon } from './icons'
import type { Account, ChatMessage, GmailAccount } from '../types'

export interface BusinessAccountSummary {
  id: string
  provider: string
  label: string
  sender_name: string
  status: string
  profile_picture_url?: string
  profile_username?: string
}

interface Props {
  expanded: boolean
  setExpanded: Dispatch<SetStateAction<boolean>>
  selectedAccount: string
  setSelectedAccount: Dispatch<SetStateAction<string>>
  setSelectedClient: (id: string | null) => void
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  selectedGmail: string | null
  accounts: Account[]
  gmailAccounts: GmailAccount[]
  businessAccounts?: BusinessAccountSummary[]
  selectedBusiness?: string
  businessUnreads?: Record<string, number>
  onBusinessClick?: (accountId: string) => void
  unreadCount: number
  accountUnreads: Record<string, number>
  onAccountClick: (accountId: string) => void
  onGmailClick: (accountId: string) => void
  onOpenSettings: () => void
  currentVersion: string
}

/** Narrow left rail with account icons; expands on hover to show labels. */
export function AccountRail({
  expanded,
  setExpanded,
  selectedAccount,
  setSelectedAccount,
  setSelectedClient,
  setMessages,
  selectedGmail,
  accounts,
  gmailAccounts,
  businessAccounts = [],
  selectedBusiness = '',
  businessUnreads = {},
  onBusinessClick,
  unreadCount,
  accountUnreads,
  onAccountClick,
  onGmailClick,
  onOpenSettings,
  currentVersion,
}: Props) {
  const SOCIAL_PROVIDERS = new Set(['facebook_messenger', 'instagram_direct'])
  const bizItems = businessAccounts.filter(b => !SOCIAL_PROVIDERS.has(b.provider))
  const socialItems = businessAccounts.filter(b => SOCIAL_PROVIDERS.has(b.provider))
  const renderBizItem = (b: BusinessAccountSummary) => (
    <button
      key={b.id}
      className={`rail-item ${selectedBusiness === b.id ? 'active' : ''}`}
      onClick={() => onBusinessClick?.(b.id)}
      title={`${b.label} — ${b.sender_name}`}
    >
      <span className="rail-item-icon">
        {b.profile_picture_url
          ? <img src={b.profile_picture_url.startsWith('http')
                     ? b.profile_picture_url
                     : `https://cc.vidnova.app${b.profile_picture_url}`}
                 alt="" className="rail-avatar-img" />
          : <>
              {b.provider === 'viber_turbosms' && <ViberIcon size={18} />}
              {b.provider === 'facebook_messenger' && <FacebookIcon size={18} />}
              {b.provider === 'instagram_direct' && <InstagramIcon size={18} />}
              {b.provider === 'whatsapp_cloud' && <WhatsAppIcon size={18} color="#25D366" />}
              {b.provider === 'telegram_bot' && <TelegramBotIcon size={18} />}
            </>
        }
        {businessUnreads[b.id] > 0 && <span className="rail-badge">{businessUnreads[b.id] > 99 ? '99+' : businessUnreads[b.id]}</span>}
        <span className={`rail-status ${b.status === 'active' ? 'online' : ''}`} />
      </span>
      {expanded && (
        <span className="rail-item-text">
          <span className="rail-item-name">{b.label}</span>
          <span className="rail-item-phone">{b.sender_name}</span>
        </span>
      )}
    </button>
  )
  return (
    <div
      className={`account-rail ${expanded ? 'expanded' : ''}`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div className="rail-accounts">
        <button
          className={`rail-item ${!selectedAccount && !selectedBusiness ? 'active' : ''}`}
          onClick={() => { setSelectedAccount(''); setSelectedClient(null); setMessages([]) }}
          title="Усі месенджери"
        >
          <span className="rail-item-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            {unreadCount > 0 && <span className="rail-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </span>
          {expanded && <span className="rail-item-label">Усі месенджери</span>}
        </button>
        {bizItems.length > 0 && (
          <>
            <div className="rail-section-label">{expanded ? 'Бізнес' : 'Б'}</div>
            {bizItems.map(renderBizItem)}
          </>
        )}
        {socialItems.length > 0 && (
          <>
            <div className="rail-section-label">{expanded ? 'Соцмережі' : 'С'}</div>
            {socialItems.map(renderBizItem)}
          </>
        )}
        {(bizItems.length > 0 || socialItems.length > 0) && (
          <div className="rail-section-label">{expanded ? 'Месенджери' : 'М'}</div>
        )}
        {accounts.map(acc => (
          <button
            key={acc.id}
            className={`rail-item ${selectedAccount === acc.id ? 'active' : ''}`}
            onClick={() => onAccountClick(acc.id)}
            title={`${acc.label} ${acc.phone}`}
          >
            <span className="rail-item-icon">
              {acc.type === 'telegram'
                ? <TelegramIcon size={18} color={selectedAccount === acc.id ? '#2AABEE' : 'currentColor'} />
                : <WhatsAppIcon size={18} color={selectedAccount === acc.id ? '#25D366' : 'currentColor'} />
              }
              {accountUnreads[acc.id] > 0 && <span className="rail-badge">{accountUnreads[acc.id] > 99 ? '99+' : accountUnreads[acc.id]}</span>}
              <span className={`rail-status ${acc.status === 'active' || acc.status === 'connected' ? 'online' : ''}`} />
            </span>
            {expanded && (
              <span className="rail-item-text">
                <span className="rail-item-name">{acc.label}</span>
                <span className="rail-item-phone">{acc.phone}</span>
              </span>
            )}
          </button>
        ))}
        {gmailAccounts.length > 0 && <div className="rail-divider" />}
        {gmailAccounts.map(gm => (
          <button
            key={gm.id}
            className={`rail-item ${selectedGmail === gm.id ? 'active' : ''}`}
            onClick={() => onGmailClick(gm.id)}
            title={`${gm.label} — ${gm.email}`}
          >
            <span className="rail-item-icon">
              <GmailIcon size={18} color={selectedGmail === gm.id ? '#EA4335' : 'currentColor'} />
              <span className={`rail-status ${gm.status === 'active' ? 'online' : ''}`} />
            </span>
            {expanded && (
              <span className="rail-item-text">
                <span className="rail-item-name">{gm.label}</span>
                <span className="rail-item-phone">{gm.email}</span>
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="rail-bottom">
        <button className="rail-item rail-settings-btn" onClick={onOpenSettings} title="Налаштування">
          <span className="rail-item-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </span>
          {expanded && <span className="rail-item-label">Налаштування</span>}
        </button>
        {expanded && currentVersion && (
          <div className="rail-version">
            <span>v{currentVersion}</span>
          </div>
        )}
      </div>
    </div>
  )
}
