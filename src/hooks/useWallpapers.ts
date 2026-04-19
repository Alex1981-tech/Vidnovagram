import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '../constants'
import { authFetch } from '../utils/authFetch'
import type { Wallpaper } from '../types'
import type { ChatBackground } from '../settings'

export interface UseWallpapersResult {
  wallpapers: Wallpaper[]
  wallpaperBlobUrl: string
}

/**
 * Lazily loads the wallpaper gallery the first time the settings modal opens
 * and keeps a blob URL of the currently-active wallpaper background.
 */
export function useWallpapers({
  showSettingsModal,
  chatBackground,
  token,
}: {
  showSettingsModal: boolean
  chatBackground: ChatBackground
  token: string | undefined
}): UseWallpapersResult {
  const [wallpapers, setWallpapers] = useState<Wallpaper[]>([])
  const [wallpaperBlobUrl, setWallpaperBlobUrl] = useState('')
  const wallpapersLoaded = useRef(false)

  useEffect(() => {
    if (chatBackground.type === 'wallpaper' && chatBackground.value && token) {
      const fullUrl = `${API_BASE.replace('/api', '')}${chatBackground.value}`
      authFetch(fullUrl, token).then(async (resp) => {
        if (resp.ok) {
          const blob = await resp.blob()
          setWallpaperBlobUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return URL.createObjectURL(blob)
          })
        }
      }).catch(() => {})
    } else {
      setWallpaperBlobUrl('')
    }
  }, [chatBackground.type, chatBackground.value, token])

  useEffect(() => {
    if (showSettingsModal && wallpapers.length === 0 && !wallpapersLoaded.current && token) {
      wallpapersLoaded.current = true
      fetch(`${API_BASE}/vidnovagram/wallpapers/`, {
        headers: { Authorization: `Token ${token}` },
      })
        .then(r => (r.ok ? r.json() : []))
        .then(async (wps: Wallpaper[]) => {
          // Show placeholders immediately, then stream thumbnails in batches of 8.
          const result = wps.map(wp => ({ ...wp, _thumbBlob: '' }))
          setWallpapers([...result])
          const BATCH = 8
          for (let i = 0; i < wps.length; i += BATCH) {
            const batch = wps.slice(i, i + BATCH)
            const loaded = await Promise.all(batch.map(async (wp, j) => {
              try {
                const thumbUrl = `${API_BASE.replace('/api', '')}${wp.thumb}`
                const resp = await authFetch(thumbUrl, token)
                if (resp.ok) {
                  const blob = await resp.blob()
                  return { idx: i + j, blob: URL.createObjectURL(blob) }
                }
              } catch {
                // ignore
              }
              return { idx: i + j, blob: '' }
            }))
            for (const item of loaded) {
              result[item.idx]._thumbBlob = item.blob
            }
            setWallpapers([...result])
          }
        })
        .catch(() => {})
    }
  }, [showSettingsModal, token])

  return { wallpapers, wallpaperBlobUrl }
}
