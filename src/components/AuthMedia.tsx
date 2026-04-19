import { useEffect, useRef } from 'react'

/**
 * Authenticated image renderer that fetches the media through a caller-provided
 * `loadBlob` and falls back to a secondary path if the primary fails. Keeps
 * retry bookkeeping local so several AuthMedia instances don't trample each
 * other.
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
  if (!src) return <div className="msg-media-placeholder">📷 ...</div>
  if (type === 'image') {
    return (
      <img
        src={src}
        alt=""
        className={className}
        onClick={onClick}
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
