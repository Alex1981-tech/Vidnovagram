import { useEffect, useState } from 'react'
import { API_BASE } from '../constants'
import { authFetch } from '../utils/authFetch'
import type { LinkPreview } from '../types'

// Module-level cache shared across LinkPreviewCard renders. Keeping it here
// (not in App) means a future refactor that mounts the card in several places
// won't have to re-thread the ref through every consumer.
export const linkPreviewCache = new Map<string, LinkPreview | null>()

export function LinkPreviewCard({ url, token, onClick }: {
  url: string
  token: string
  onClick: (u: string) => void
}) {
  const [preview, setPreview] = useState<LinkPreview | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!url || loaded) return
    setLoaded(true)
    const cached = linkPreviewCache.get(url)
    if (cached !== undefined) {
      setPreview(cached)
      return
    }
    authFetch(`${API_BASE}/messenger/link-preview/?url=${encodeURIComponent(url)}`, token)
      .then(r => (r.ok ? r.json() : null))
      .then((data: LinkPreview | null) => {
        if (data && data.title) {
          linkPreviewCache.set(url, data)
          setPreview(data)
        } else {
          linkPreviewCache.set(url, null)
        }
      })
      .catch(() => {
        linkPreviewCache.set(url, null)
      })
  }, [url, token, loaded])

  if (!preview) return null

  return (
    <div className="link-preview" onClick={e => { e.stopPropagation(); onClick(url) }}>
      {preview.image && (
        <img
          src={preview.image}
          alt=""
          className="link-preview-img"
          onError={e => (e.currentTarget.style.display = 'none')}
        />
      )}
      <div className="link-preview-body">
        {preview.site_name && <span className="link-preview-site">{preview.site_name}</span>}
        <span className="link-preview-title">{preview.title}</span>
        {preview.description && <span className="link-preview-desc">{preview.description}</span>}
      </div>
    </div>
  )
}
