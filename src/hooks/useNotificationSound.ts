import { useCallback, useEffect, useRef, useState } from 'react'
import { SOUND_OPTIONS } from '../constants'
import { DEFAULT_ACCOUNT_SETTINGS, type AccountSettings, type AppSettings } from '../settings'

export interface NotificationSoundController {
  soundEnabled: boolean
  setSoundEnabled: (v: boolean) => void
  playNotifSound: (accountId?: string) => void
  isPopupEnabled: (accountId?: string) => boolean
  getAccountSettings: (accountId: string) => AccountSettings
}

/**
 * Ownership:
 *  - `soundEnabled` global toggle (localStorage `messenger-sound`).
 *  - Per-account notification settings lookup (`popupEnabled`, `soundEnabled`,
 *    per-account sound file).
 *  - Default notification Audio element, rebuilt when the global default
 *    sound changes.
 *  - `playNotifSound` — respects both global + per-account toggles, uses
 *    per-account sound file if set.
 */
export function useNotificationSound(appSettings: AppSettings): NotificationSoundController {
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem('messenger-sound') !== 'false'
    } catch {
      return true
    }
  })
  const soundEnabledRef = useRef(soundEnabled)
  const appSettingsRef = useRef(appSettings)
  const notifAudioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    soundEnabledRef.current = soundEnabled
  }, [soundEnabled])

  useEffect(() => {
    appSettingsRef.current = appSettings
  }, [appSettings])

  // Persist global toggle
  useEffect(() => {
    localStorage.setItem('messenger-sound', String(soundEnabled))
  }, [soundEnabled])

  // Rebuild default notification Audio when the global sound changes
  const defaultSoundId = appSettings.accounts['__global']?.soundId || 'default'
  useEffect(() => {
    const soundSrc = SOUND_OPTIONS.find((s) => s.id === defaultSoundId)?.src || '/notification.mp3'
    const audio = new Audio(soundSrc)
    audio.volume = 0.5
    notifAudioRef.current = audio
  }, [defaultSoundId])

  const getAccountSettings = useCallback((accountId: string): AccountSettings => {
    return appSettingsRef.current.accounts[accountId] || DEFAULT_ACCOUNT_SETTINGS
  }, [])

  const playNotifSound = useCallback((accountId?: string) => {
    if (!soundEnabledRef.current) return
    if (accountId) {
      const acctSettings = getAccountSettings(accountId)
      if (!acctSettings.soundEnabled) return
      if (acctSettings.soundId && acctSettings.soundId !== 'default') {
        const src = SOUND_OPTIONS.find((s) => s.id === acctSettings.soundId)?.src
        if (src) {
          const a = new Audio(src)
          a.volume = 0.5
          a.play().catch(() => {})
          return
        }
      }
    }
    try {
      notifAudioRef.current?.play().catch(() => {})
    } catch {
      // audio not ready
    }
  }, [getAccountSettings])

  const isPopupEnabled = useCallback((accountId?: string): boolean => {
    if (!accountId) return true
    return getAccountSettings(accountId).popupEnabled
  }, [getAccountSettings])

  return {
    soundEnabled,
    setSoundEnabled,
    playNotifSound,
    isPopupEnabled,
    getAccountSettings,
  }
}
