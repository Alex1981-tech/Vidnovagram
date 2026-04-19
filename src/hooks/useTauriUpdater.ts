import { useEffect, useState } from 'react'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { getVersion } from '@tauri-apps/api/app'
import { LAST_VERSION_KEY } from '../constants'

export interface TauriUpdater {
  currentVersion: string
  showWhatsNew: boolean
  setShowWhatsNew: (v: boolean) => void
  updateReady: boolean
  updateProgress: string
}

/**
 * Owns the full Tauri auto-update lifecycle:
 *  - Reads the current app version
 *  - Toggles the "What's New" modal when the version changes
 *  - Runs a silent `check()` on startup and every 30 minutes
 *  - Downloads the update in the background and auto-relaunches once the
 *    user has been idle for 60s
 */
export function useTauriUpdater(): TauriUpdater {
  const [updateReady, setUpdateReady] = useState(false)
  const [updateProgress, setUpdateProgress] = useState('')
  const [showWhatsNew, setShowWhatsNew] = useState(false)
  const [currentVersion, setCurrentVersion] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const ver = await getVersion()
        setCurrentVersion(ver)
        const lastVer = localStorage.getItem(LAST_VERSION_KEY)
        if (lastVer && lastVer !== ver) {
          setShowWhatsNew(true)
        }
        localStorage.setItem(LAST_VERSION_KEY, ver)
      } catch {
        // ignore
      }
    })()

    const doUpdateCheck = async () => {
      try {
        const update = await check()
        if (update) {
          console.log('Update available:', update.version)
          setUpdateProgress('downloading')
          await update.downloadAndInstall((ev) => {
            console.log('Update event:', JSON.stringify(ev))
          })
          setUpdateProgress('')
          setUpdateReady(true)
          // Relaunch once the user has been idle for 60s.
          let lastActivity = Date.now()
          const trackActivity = () => { lastActivity = Date.now() }
          window.addEventListener('mousemove', trackActivity)
          window.addEventListener('keydown', trackActivity)
          const tryRelaunch = setInterval(async () => {
            if (Date.now() - lastActivity > 60_000) {
              clearInterval(tryRelaunch)
              window.removeEventListener('mousemove', trackActivity)
              window.removeEventListener('keydown', trackActivity)
              await relaunch()
            }
          }, 5_000)
        }
      } catch (e: any) {
        console.error('Update failed:', e?.message || e)
        setUpdateProgress(String(e?.message || 'Помилка оновлення').substring(0, 80))
        setTimeout(() => setUpdateProgress(''), 10_000)
      }
    }

    const delay = setTimeout(doUpdateCheck, 3_000)
    const interval = setInterval(doUpdateCheck, 30 * 60 * 1000)
    return () => {
      clearTimeout(delay)
      clearInterval(interval)
    }
  }, [])

  return { currentVersion, showWhatsNew, setShowWhatsNew, updateReady, updateProgress }
}
