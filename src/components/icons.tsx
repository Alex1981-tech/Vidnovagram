// Icon primitives used across the app. Theme icons live here next to the
// messenger brand marks for one obvious import point.

export const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
  </svg>
)

export const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
  </svg>
)

export const MonitorIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>
  </svg>
)

// VoIP modal icons

export const PhoneIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
)

export const PhoneOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67"/>
    <path d="M14.118 7.813a2 2 0 0 1-.45 2.11L12.4 11.2"/>
    <path d="M2.3 2.3a2 2 0 0 1 1.81-1.3h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81"/>
    <line x1="2" x2="22" y1="2" y2="22"/>
  </svg>
)

export const MicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>
  </svg>
)

export const MicOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/>
  </svg>
)

export const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>
  </svg>
)

export const UserIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
)

export const VideoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>
  </svg>
)

export const PaperclipIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
  </svg>
)

export const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
  </svg>
)

export const ForwardIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>
  </svg>
)

// Brand marks for Telegram / WhatsApp / Gmail, used in account tabs
// and settings.

export const TelegramIcon = ({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.692-1.653-1.123-2.678-1.799-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.492-1.302.487-.429-.008-1.252-.242-1.865-.442-.751-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.465.141.12.099.153.232.168.327.016.094.036.31.02.478z"/>
  </svg>
)

export const WhatsAppIcon = ({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)

export const GmailIcon = ({ size = 20 }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z" fill="#fff"/>
    <path d="M2 6h4v12H4a2 2 0 0 1-2-2V6z" fill="#4285F4"/>
    <path d="M22 6h-4v12h2a2 2 0 0 0 2-2V6z" fill="#34A853"/>
    <path d="M6 18V9l6 4.5L18 9v9H6z" fill="#fff"/>
    <path d="M2 6l10 7.5L22 6" fill="#EA4335"/>
    <path d="M2 6l4 3V6H2z" fill="#C5221F"/>
    <path d="M22 6l-4 3V6h4z" fill="#0B8043"/>
  </svg>
)

// Facebook Messenger bubble.
export const FacebookIcon = ({ size = 20 }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path
      fill="#0084FF"
      d="M12 2C6.48 2 2 6.14 2 11.24c0 2.91 1.42 5.52 3.66 7.24v3.52l3.36-1.84c.89.25 1.84.38 2.98.38 5.52 0 10-4.14 10-9.3S17.52 2 12 2zm1.02 12.55l-2.57-2.75-5.02 2.75 5.52-5.87 2.64 2.75 4.96-2.75-5.53 5.87z"
    />
  </svg>
)

// Instagram brand gradient.
export const InstagramIcon = ({ size = 20 }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <defs>
      <linearGradient id="igGrad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#FED576" />
        <stop offset="26%" stopColor="#F47133" />
        <stop offset="61%" stopColor="#BC3081" />
        <stop offset="100%" stopColor="#4C63D2" />
      </linearGradient>
    </defs>
    <rect width="24" height="24" rx="6" fill="url(#igGrad)" />
    <path
      fill="#fff"
      d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4zm5.3-8.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"
    />
  </svg>
)

// Telegram bot — standard Telegram paper plane + a small robot overlay so
// operators visually distinguish bot chats from personal TG accounts.
export const TelegramBotIcon = ({ size = 20 }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="12" fill="#2AABEE" />
    <path
      fill="#fff"
      d="M17.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.692-1.653-1.123-2.678-1.799-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.492-1.302.487-.429-.008-1.252-.242-1.865-.442-.751-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.465.141.12.099.153.232.168.327.016.094.036.31.02.478z"
    />
    {/* "bot" badge — small dot with antenna */}
    <circle cx="19" cy="5" r="4" fill="#ff6b35" stroke="#fff" strokeWidth="0.8" />
    <path d="M19 3.2v-1.2M17.8 4h-.6M20.8 4h-.6" stroke="#fff" strokeWidth="0.6" strokeLinecap="round" />
    <circle cx="17.8" cy="5.2" r="0.4" fill="#fff" />
    <circle cx="20.2" cy="5.2" r="0.4" fill="#fff" />
  </svg>
)

// Viber official purple brand mark (simplified).
export const ViberIcon = ({ size = 20 }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path
      fill="#7360f2"
      d="M12.01 1.5c-3.07 0-5.62.1-7.17.92C3.3 3.2 2.3 4.58 1.88 6.66 1.57 8.2 1.5 10.08 1.5 12.5c0 2.44.07 4.33.39 5.88.42 2.03 1.42 3.43 2.92 4.27 1.58.89 4.76 1.37 7.16 1.37.5 0 .97-.02 1.4-.07.1-.01.18-.08.19-.18.02-.1-.03-.2-.12-.24l-.54-.23c-.7-.3-.68-.54-.65-.82l.1-.95c.02-.2.15-.37.34-.43 5.06-1.49 6.2-5.73 6.2-10.1 0-3.87-.82-6.32-2.6-7.97C14.47 1.69 13.3 1.5 12.01 1.5z"
    />
    <path
      fill="#fff"
      d="M12 6.2c-.31 0-.56.25-.56.55s.25.55.56.55c2.65 0 4.8 2.15 4.8 4.8 0 .3.25.55.55.55s.55-.25.55-.55c0-3.26-2.65-5.9-5.9-5.9zm0 1.9c-.31 0-.56.25-.56.55s.25.55.56.55c1.62 0 2.9 1.28 2.9 2.9 0 .3.25.55.55.55s.55-.25.55-.55c0-2.22-1.78-4-4-4zm0 1.9c-.31 0-.56.25-.56.55s.25.55.56.55c.57 0 1 .43 1 1 0 .3.25.55.55.55s.55-.25.55-.55c0-1.17-.93-2.1-2.1-2.1zm-3.4-2.55c-.2 0-.45.03-.63.18-.35.28-.95.91-1.1 1.6-.15.7.1 1.5.6 2.38.68 1.2 1.56 2.3 2.52 3.17.93.87 2.05 1.65 3.37 2.15 1.02.39 1.87.48 2.5.27.55-.17 1.05-.75 1.28-1.2.18-.37.13-.7-.02-.95-.12-.21-.38-.38-.67-.54l-1.35-.7c-.32-.17-.67-.1-.95.13l-.45.4c-.15.13-.33.15-.5.08-.55-.25-1.5-.85-2.25-1.55-.72-.67-1.35-1.55-1.6-2.05-.07-.15-.05-.33.08-.47l.43-.45c.22-.27.3-.62.13-.93l-.68-1.3c-.13-.27-.28-.5-.48-.62-.12-.07-.23-.1-.37-.12-.1-.01-.18-.02-.35-.02z"
    />
  </svg>
)
