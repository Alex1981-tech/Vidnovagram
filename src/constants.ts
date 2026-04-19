// Environment / server endpoints
export const API_BASE = 'https://cc.vidnova.app/api'
export const WS_BASE = 'wss://cc.vidnova.app/ws'

// localStorage keys
export const AUTH_KEY = 'vidnovagram_auth'
export const THEME_KEY = 'vidnovagram_theme'
export const LAST_VERSION_KEY = 'vidnovagram_last_version'
export const SETTINGS_KEY = 'vidnovagram_settings'

// Notification sound catalogue. Files live under public/sounds/.
export interface SoundOption {
  id: string
  label: string
  src: string
}

export const SOUND_OPTIONS: SoundOption[] = [
  { id: 'default', label: 'Стандартний', src: '/notification.mp3' },
  ...Array.from({ length: 26 }, (_, i) => ({
    id: String(i + 1),
    label: `Звук ${i + 1}`,
    src: `/sounds/${i + 1}.mp3`,
  })),
]
