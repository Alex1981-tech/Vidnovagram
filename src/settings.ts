import { SETTINGS_KEY } from './constants'

export interface AccountSettings {
  popupEnabled: boolean
  soundEnabled: boolean
  soundId: string // 'default' | '1'..'26'
}


export interface ChatBackground {
  type: 'default' | 'color' | 'wallpaper'
  value: string // hex color or wallpaper URL
}

export interface AppSettings {
  accounts: Record<string, AccountSettings>
  chatBackground: ChatBackground
}

export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  popupEnabled: true,
  soundEnabled: true,
  soundId: 'default',
}

export const DEFAULT_SETTINGS: AppSettings = {
  accounts: {},
  chatBackground: { type: 'default', value: '' },
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    // corrupted localStorage — fall back to defaults
  }
  return { ...DEFAULT_SETTINGS }
}

export function saveSettings(s: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}
