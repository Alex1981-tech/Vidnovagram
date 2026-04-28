import type { Dispatch, SetStateAction } from 'react'
import { useState, useEffect, useCallback } from 'react'
import { TelegramIcon, WhatsAppIcon, GmailIcon, ViberIcon, FacebookIcon, InstagramIcon, TelegramBotIcon } from './icons'
import type { Account, ChatMessage, GmailAccount, MetaAccount } from '../types'

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
  metaAccounts?: MetaAccount[]
  selectedMeta?: string
  onMetaClick?: (accountId: string) => void
  onOpenSettings: () => void
  currentVersion: string
}

// Persistent collapse/expand state per section. localStorage so the
// rail remembers what the manager last left collapsed.
const RAIL_SECTIONS_KEY = 'vg_rail_sections_v1'
type SectionKey = 'business' | 'social' | 'social_fb' | 'social_ig' | 'messengers' | 'email'

function loadCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(RAIL_SECTIONS_KEY)
    return raw ? JSON.parse(raw) as Record<string, boolean> : {}
  } catch { return {} }
}
function saveCollapsed(state: Record<string, boolean>) {
  try { localStorage.setItem(RAIL_SECTIONS_KEY, JSON.stringify(state)) } catch { /* noop */ }
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      className="rail-caret"
      width="10" height="10" viewBox="0 0 16 16"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M6 4l5 4-5 4" />
    </svg>
  )
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
  metaAccounts = [],
  selectedMeta = '',
  onMetaClick,
  onOpenSettings,
  currentVersion,
}: Props) {
  // Sections start expanded by default; only sections the manager has
  // explicitly collapsed are persisted as `true` in localStorage.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed)
  useEffect(() => { saveCollapsed(collapsed) }, [collapsed])
  const isOpen = useCallback((k: SectionKey) => !collapsed[k], [collapsed])
  const toggle = useCallback((k: SectionKey) => setCollapsed(c => ({ ...c, [k]: !c[k] })), [])

  // Phase 1 convergence (2026-04-28): FB/IG live exclusively in
  // `MetaAccount`. The legacy `BusinessAccount` provider values
  // facebook_messenger / instagram_direct are no longer surfaced by
  // the backend (`business_accounts_public` excludes them), so the
  // Бізнес rail only carries Viber / TG-bot / WA Cloud / etc. and the
  // social rail is sourced from `metaAccounts` alone.
  const bizItems = businessAccounts

  // Meta accounts split by platform for FB/IG sub-sections
  const fbMeta = metaAccounts.filter(m => m.platform === 'facebook')
  const igMeta = metaAccounts.filter(m => m.platform === 'instagram')

  // Counts that drive whether to show a section header at all
  const hasBusiness = bizItems.length > 0
  const hasMessengers = accounts.length > 0
  const hasEmail = gmailAccounts.length > 0
  const hasFB = fbMeta.length > 0
  const hasIG = igMeta.length > 0
  const hasSocial = hasFB || hasIG

  // Section header — clickable to toggle; collapsed-rail variant shows
  // a single letter + a tiny caret so it stays a clear affordance.
  const SectionHeader = ({ section, label, short, count }:
    { section: SectionKey; label: string; short: string; count: number }) => (
    <button
      type="button"
      className="rail-section-header"
      onClick={() => toggle(section)}
      title={label}
    >
      <Caret open={isOpen(section)} />
      <span className="rail-section-label-text">{expanded ? label : short}</span>
      {count > 0 && <span className="rail-section-count">{count}</span>}
    </button>
  )

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

  const renderMetaItem = (m: MetaAccount) => {
    const Icon = m.platform === 'facebook' ? FacebookIcon : InstagramIcon
    const iconColor = m.platform === 'facebook'
      ? (selectedMeta === m.id ? '#1877F2' : 'currentColor')
      : (selectedMeta === m.id ? '#E4405F' : 'currentColor')
    const isInactive = m.status !== 'connected'
    return (
      <button
        key={m.id}
        className={`rail-item ${selectedMeta === m.id ? 'active' : ''} ${isInactive ? 'inactive' : ''}`}
        onClick={() => onMetaClick?.(m.id)}
        title={`${m.label}${isInactive ? ' (' + m.status + ')' : ''}`}
      >
        <span className="rail-item-icon">
          <Icon size={18} color={iconColor} />
          <span className={`rail-status ${m.status === 'connected' ? 'online' : ''}`} />
        </span>
        {expanded && (
          <span className="rail-item-text">
            <span className="rail-item-name">{m.label}</span>
            <span className="rail-item-phone">{m.username || m.brand_group}</span>
          </span>
        )}
      </button>
    )
  }

  const renderAccount = (acc: Account) => (
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
  )

  const renderGmail = (gm: GmailAccount) => (
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
  )

  return (
    <div
      className={`account-rail ${expanded ? 'expanded' : ''}`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div className="rail-accounts">
        <button
          className={`rail-item ${!selectedAccount && !selectedBusiness && !selectedGmail && !selectedMeta ? 'active' : ''}`}
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

        {/* ── Бізнес ── */}
        {hasBusiness && (
          <>
            <SectionHeader section="business" label="Бізнес" short="Б" count={bizItems.length} />
            {isOpen('business') && bizItems.map(renderBizItem)}
          </>
        )}

        {/* ── Соцмережі (з підгрупами Facebook / Instagram) ── */}
        {hasSocial && (
          <>
            <SectionHeader
              section="social"
              label="Соцмережі"
              short="С"
              count={fbMeta.length + igMeta.length}
            />
            {isOpen('social') && (
              <>
                {hasFB && (
                  <>
                    <button
                      type="button"
                      className="rail-section-subheader"
                      onClick={() => toggle('social_fb')}
                      title="Facebook"
                    >
                      <Caret open={isOpen('social_fb')} />
                      <FacebookIcon size={14} color="#1877F2" />
                      {expanded && <span className="rail-section-label-text">Facebook</span>}
                      <span className="rail-section-count">{fbMeta.length}</span>
                    </button>
                    {isOpen('social_fb') && (
                      <>
                        {fbMeta.map(renderMetaItem)}
                      </>
                    )}
                  </>
                )}
                {hasIG && (
                  <>
                    <button
                      type="button"
                      className="rail-section-subheader"
                      onClick={() => toggle('social_ig')}
                      title="Instagram"
                    >
                      <Caret open={isOpen('social_ig')} />
                      <InstagramIcon size={14} color="#E4405F" />
                      {expanded && <span className="rail-section-label-text">Instagram</span>}
                      <span className="rail-section-count">{igMeta.length}</span>
                    </button>
                    {isOpen('social_ig') && (
                      <>
                        {igMeta.map(renderMetaItem)}
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ── Месенджери (TG/WA) ── */}
        {hasMessengers && (
          <>
            <SectionHeader section="messengers" label="Месенджери" short="М" count={accounts.length} />
            {isOpen('messengers') && accounts.map(renderAccount)}
          </>
        )}

        {/* ── Email (Gmail) ── */}
        {hasEmail && (
          <>
            <SectionHeader section="email" label="Пошта" short="@" count={gmailAccounts.length} />
            {isOpen('email') && gmailAccounts.map(renderGmail)}
          </>
        )}
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
