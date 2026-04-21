import type { ReactElement } from 'react'
import {
  TelegramIcon, WhatsAppIcon, GmailIcon,
  ViberIcon, FacebookIcon, InstagramIcon, TelegramBotIcon,
} from './icons'
import type { Account, Contact, GmailAccount } from '../types'
import type { BusinessAccountSummary } from './AccountRail'

interface Props {
  selectedGmail: string | null
  gmailAccounts: GmailAccount[]
  selectedAccount: string
  accounts: Account[]
  hasMessengerAccounts: boolean
  contacts: Contact[]
  selectedBusiness?: string
  businessAccounts?: BusinessAccountSummary[]
}

type BrandPreset = {
  /** Solid background tint (bottom of gradient) */
  color: string
  /** Top gradient colour — lighter side */
  colorLight: string
  /** Text colour on tinted bg (white for dark, dark for very light) */
  text: string
  icon: (p: { size?: number; color?: string }) => ReactElement
  label: string
}

const BRAND: Record<string, BrandPreset> = {
  telegram:       { color: '#2AABEE', colorLight: '#6FD1FF', text: '#fff', icon: (p) => <TelegramIcon size={p.size ?? 18} color="#fff" />,   label: 'Telegram' },
  whatsapp:       { color: '#25D366', colorLight: '#5BE58A', text: '#fff', icon: (p) => <WhatsAppIcon size={p.size ?? 18} color="#fff" />,   label: 'WhatsApp' },
  gmail:          { color: '#EA4335', colorLight: '#FF7062', text: '#fff', icon: (p) => <GmailIcon    size={p.size ?? 18} color="#fff" />,   label: 'Gmail' },
  viber_turbosms: { color: '#7360F2', colorLight: '#A394FF', text: '#fff', icon: (p) => <ViberIcon    size={p.size ?? 18} color="#fff" />,   label: 'Viber' },
  facebook_messenger: { color: '#0084FF', colorLight: '#3AA9FF', text: '#fff', icon: (p) => <FacebookIcon size={p.size ?? 18} color="#fff" />, label: 'Messenger' },
  instagram_direct:   { color: '#E1306C', colorLight: '#F77737', text: '#fff', icon: (p) => <InstagramIcon size={p.size ?? 18} color="#fff" />, label: 'Instagram' },
  telegram_bot:   { color: '#2AABEE', colorLight: '#6FD1FF', text: '#fff', icon: (p) => <TelegramBotIcon size={p.size ?? 18} color="#fff" />, label: 'Telegram bot' },
}

function resolvePicUrl(url?: string): string | undefined {
  if (!url) return undefined
  return url.startsWith('http') ? url : `https://cc.vidnova.app${url}`
}

function Card({
  preset, avatar, title, subtitle, online,
}: { preset: BrandPreset; avatar?: string; title: string; subtitle?: string; online?: boolean }) {
  const gradient = `linear-gradient(135deg, ${preset.colorLight} 0%, ${preset.color} 100%)`
  return (
    <div
      className="active-account-card branded"
      style={{
        // CSS var consumed by the frosted overlay in App.css
        ['--aac-gradient' as any]: gradient,
        background: gradient,
        color: preset.text,
      }}
    >
      <div className="aac-avatar-slot">
        {avatar
          ? <img src={avatar} alt="" className="aac-avatar" />
          : <div className="aac-avatar-fallback">{preset.icon({ size: 20 })}</div>}
        <span className="aac-badge">{preset.icon({ size: 10 })}</span>
      </div>
      <div className="aac-text">
        <div className="aac-title">{title}</div>
        {subtitle && <div className="aac-subtitle">{subtitle}</div>}
      </div>
      <span className={`aac-status ${online ? 'online' : ''}`} />
    </div>
  )
}

/** Header card inside sidebar summarising the currently-selected account. */
export function ActiveAccountCard({
  selectedGmail, gmailAccounts,
  selectedAccount, accounts,
  hasMessengerAccounts, contacts,
  selectedBusiness, businessAccounts,
}: Props) {
  // Gmail
  if (selectedGmail) {
    const gm = gmailAccounts.find(g => g.id === selectedGmail)
    return (
      <Card
        preset={BRAND.gmail}
        title={gm?.label || 'Gmail'}
        subtitle={gm?.email}
        online={gm?.status === 'active'}
      />
    )
  }

  // Business (Viber / FB / IG / Telegram bot)
  if (selectedBusiness) {
    const biz = businessAccounts?.find(b => b.id === selectedBusiness)
    if (biz) {
      const preset = BRAND[biz.provider] || BRAND.telegram
      return (
        <Card
          preset={preset}
          avatar={resolvePicUrl(biz.profile_picture_url)}
          title={biz.label || preset.label}
          subtitle={biz.sender_name || biz.profile_username || preset.label}
          online={biz.status === 'active'}
        />
      )
    }
  }

  // Telegram / WhatsApp personal accounts
  if (selectedAccount) {
    const acc = accounts.find(a => a.id === selectedAccount)
    if (acc) {
      const preset = acc.type === 'telegram' ? BRAND.telegram : BRAND.whatsapp
      return (
        <Card
          preset={preset}
          title={acc.label}
          subtitle={acc.phone}
          online={acc.status === 'active' || acc.status === 'connected'}
        />
      )
    }
  }

  // Fallback — no account selected (aggregated view)
  return (
    <div className="active-account-card">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <span className="active-account-name">{hasMessengerAccounts ? 'Усі месенджери' : 'Немає доступних акаунтів'}</span>
      <span className="active-account-phone">
        {hasMessengerAccounts ? `${contacts.length} контактів` : 'Зверніться до адміністратора'}
      </span>
    </div>
  )
}
