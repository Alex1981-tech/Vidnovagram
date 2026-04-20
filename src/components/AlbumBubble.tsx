import type { Dispatch, SetStateAction } from 'react'
import { AuthMedia } from './AuthMedia'
import { Linkify } from './Linkify'
import { TelegramIcon, WhatsAppIcon } from './icons'
import type { AlbumGroup } from '../types'

interface Props {
  album: AlbumGroup
  token: string
  mediaBlobMap: Record<string, string>
  loadMediaBlob: (key: string, mediaPath: string) => Promise<string | null>
  setLightboxSrc: Dispatch<SetStateAction<string | null>>
  shellOpen: (url: string) => Promise<void>
}

/** Album/media-group bubble: 2..N photos in a CSS grid with caption + footer. */
export function AlbumBubble({
  album,
  token,
  mediaBlobMap,
  loadMediaBlob,
  setLightboxSrc,
  shellOpen,
}: Props) {
  const count = album.messages.length
  const gridClass = count === 2 ? 'album-grid-2' : count === 3 ? 'album-grid-3' : 'album-grid-4'

  return (
    <div className={`msg ${album.direction} src-${album.source || 'telegram'}`}>
      <div className="msg-bubble">
        <div className={`album-grid ${gridClass}`}>
          {album.messages.map((am, ai) => {
            const hasMedia = am.thumbnail || am.media_file
            return (
              <div key={am.id} className={`album-item${count === 3 && ai === 0 ? ' album-item-wide' : ''}`}>
                {hasMedia ? (() => {
                  const preferFullImage = am.media_type === 'photo' && !!am.media_file
                  const mediaKey = `${preferFullImage ? 'full' : 'thumb'}_${am.id}`
                  const mediaPath = preferFullImage
                    ? am.media_file
                    : (am.thumbnail || am.media_file)
                  const fallbackPath = preferFullImage
                    ? (am.thumbnail || undefined)
                    : (am.thumbnail && am.media_file ? am.media_file : undefined)
                  return (
                    <AuthMedia
                      mediaKey={mediaKey}
                      mediaPath={mediaPath}
                      type="image"
                      className="album-media"
                      token={token}
                      blobMap={mediaBlobMap}
                      loadBlob={loadMediaBlob}
                      fallbackPath={fallbackPath}
                      onClick={async () => {
                        if (am.media_file) {
                          const blob = mediaBlobMap[`full_${am.id}`] || await loadMediaBlob(`full_${am.id}`, am.media_file)
                          if (blob) setLightboxSrc(blob)
                        } else if (mediaBlobMap[`thumb_${am.id}`]) {
                          setLightboxSrc(mediaBlobMap[`thumb_${am.id}`])
                        }
                      }}
                    />
                  )
                })() : (
                  <div className="album-placeholder">
                    {am.media_status === 'pending' ? <div className="spinner-sm" /> : `📎 ${am.media_type || 'медіа'}`}
                  </div>
                )}
                {am.media_type === 'video' && (
                  <div className="album-video-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {album.caption && (
          <div className="msg-text">
            <Linkify text={album.caption} onLinkClick={u => shellOpen(u)} />
          </div>
        )}
        <div className="msg-footer">
          <span className="msg-source">
            {album.source === 'whatsapp'
              ? <WhatsAppIcon size={10} color="#25D366" />
              : <TelegramIcon size={10} color="#2AABEE" />
            }
          </span>
          <span className="msg-time">
            {new Date(album.message_date).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {album.direction === 'sent' && (
            <span className="msg-status-text read">Прочитано</span>
          )}
        </div>
      </div>
    </div>
  )
}
