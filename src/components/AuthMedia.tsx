import { useEffect, useRef } from 'react'

/**
 * Module-level cache of natural dimensions for each mediaPath. First time a user
 * sees an image it jumps slightly (default 4:3 placeholder → real aspect ratio);
 * subsequent renders reserve the exact aspect before the blob arrives, so the
 * chat doesn't visibly reflow when scrolling or reopening.
 */
const dimsCache = new Map<string, { w: number; h: number }>()

/**
 * Authenticated image renderer that fetches the media through a caller-provided
 * `loadBlob` and falls back to a secondary path if the primary fails. Keeps
 * retry bookkeeping local so several AuthMedia instances don't trample each
 * other. Placeholder reserves space matching the image's aspect ratio (cached
 * from previous load) to prevent layout shift.
 */
export function AuthMedia({
  mediaKey,
  mediaPath,
  type,
  className,
  token,
  blobMap,
  loadBlob,
  onClick,
  fallbackPath,
}: {
  mediaKey: string
  mediaPath: string
  type: 'image'
  className?: string
  token: string
  blobMap: Record<string, string>
  loadBlob: (key: string, path: string) => Promise<string | null>
  onClick?: () => void
  fallbackPath?: string
}) {
  const fallbackKey = fallbackPath
    ? mediaKey.startsWith('thumb_')
      ? mediaKey.replace('thumb_', 'full_')
      : mediaKey.startsWith('full_')
        ? mediaKey.replace('full_', 'thumb_')
        : `${mediaKey}__fallback`
    : ''
  const retried = useRef(false)
  const fallbackTried = useRef(false)

  useEffect(() => {
    if (!token || blobMap[mediaKey] || blobMap[fallbackKey]) return
    retried.current = false
    fallbackTried.current = false
    loadBlob(mediaKey, mediaPath)
      .then(result => {
        if (!result && fallbackPath) {
          return loadBlob(fallbackKey, fallbackPath)
        }
        return result
      })
      .then(result => {
        // Retry once after 3s if both primary and fallback fail.
        if (!result && !retried.current) {
          retried.current = true
          setTimeout(() => {
            loadBlob(mediaKey, mediaPath).then(r => {
              if (!r && fallbackPath) loadBlob(fallbackKey, fallbackPath)
            })
          }, 3000)
        }
      })
  }, [token, mediaKey, mediaPath])

  const src = blobMap[mediaKey] || blobMap[fallbackKey]

  // Cached aspect — from primary path or from fallback (same content, different key)
  const cached = dimsCache.get(mediaPath) || (fallbackPath ? dimsCache.get(fallbackPath) : undefined)
  const aspectStyle = cached
    ? { aspectRatio: `${cached.w} / ${cached.h}` }
    : { aspectRatio: '4 / 3' as const }

  if (!src) {
    return (
      <div
        className={`${className || ''} auth-media-loading`}
        style={aspectStyle}
      >
        <span>📷 ...</span>
      </div>
    )
  }

  if (type === 'image') {
    return (
      <img
        src={src}
        alt=""
        className={className}
        onClick={onClick}
        onLoad={(e) => {
          const img = e.currentTarget
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            dimsCache.set(mediaPath, { w: img.naturalWidth, h: img.naturalHeight })
            if (fallbackPath) dimsCache.set(fallbackPath, { w: img.naturalWidth, h: img.naturalHeight })
          }
        }}
        onError={() => {
          if (fallbackPath && !blobMap[fallbackKey] && !fallbackTried.current) {
            fallbackTried.current = true
            loadBlob(fallbackKey, fallbackPath)
            return
          }
          if (!retried.current) {
            retried.current = true
            setTimeout(() => loadBlob(mediaKey, mediaPath), 2000)
          }
        }}
      />
    )
  }
  return null
}
