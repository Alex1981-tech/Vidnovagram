import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { AuthMedia } from './AuthMedia'
import { VoicePlayer } from './VoicePlayer'
import type { ChatMessage } from '../types'

type Tab = 'photo' | 'video' | 'document' | 'voice'

interface VnoteModalState {
  src: string
  id: string | number
}

interface Props {
  messages: ChatMessage[]
  token: string
  mediaBlobMap: Record<string, string>
  mediaLoading: Record<string, boolean>
  loadMediaBlob: (key: string, mediaPath: string) => Promise<string | null>
  setLightboxSrc: Dispatch<SetStateAction<string | null>>
  openMedia: (mediaPath: string, mediaType: string, messageId: string | number) => void
  setVnoteModal: Dispatch<SetStateAction<VnoteModalState | null>>
  setVnotePlaying: Dispatch<SetStateAction<boolean>>
  setVnoteProgress: Dispatch<SetStateAction<number>>
}

const LIMIT = 48

/**
 * Telegram-style shared media panel: tab strip with Photos / Videos / Files / Voice
 * counts + the active tab's content. Photo/video grid opens lightbox or vnote modal,
 * document list opens in shell, voice list uses VoicePlayer.
 */
export function SharedMediaPanel({
  messages,
  token,
  mediaBlobMap,
  mediaLoading,
  loadMediaBlob,
  setLightboxSrc,
  openMedia,
  setVnoteModal,
  setVnotePlaying,
  setVnoteProgress,
}: Props) {
  const photos = messages.filter(m => m.media_type === 'photo' && (m.thumbnail || m.media_file))
  const videos = messages.filter(m => (m.media_type === 'video' || m.media_type === 'video_note') && m.media_file)
  const documents = messages.filter(m => m.media_type === 'document' && m.media_file)
  const voices = messages.filter(m => m.media_type === 'voice' && m.media_file)

  const defaultTab: Tab = photos.length ? 'photo'
    : videos.length ? 'video'
    : documents.length ? 'document'
    : voices.length ? 'voice'
    : 'photo'
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab)

  const total = photos.length + videos.length + documents.length + voices.length
  if (total === 0) return null

  return (
    <div className="shared-media-panel">
      <div className="shared-media-tabs">
        <button
          className={`shared-media-tab ${activeTab === 'photo' ? 'active' : ''}${photos.length === 0 ? ' disabled' : ''}`}
          onClick={() => { if (photos.length) setActiveTab('photo') }}
          disabled={photos.length === 0}
        >
          Фото <span className="shared-media-count">{photos.length}</span>
        </button>
        <button
          className={`shared-media-tab ${activeTab === 'video' ? 'active' : ''}${videos.length === 0 ? ' disabled' : ''}`}
          onClick={() => { if (videos.length) setActiveTab('video') }}
          disabled={videos.length === 0}
        >
          Відео <span className="shared-media-count">{videos.length}</span>
        </button>
        <button
          className={`shared-media-tab ${activeTab === 'document' ? 'active' : ''}${documents.length === 0 ? ' disabled' : ''}`}
          onClick={() => { if (documents.length) setActiveTab('document') }}
          disabled={documents.length === 0}
        >
          Файли <span className="shared-media-count">{documents.length}</span>
        </button>
        <button
          className={`shared-media-tab ${activeTab === 'voice' ? 'active' : ''}${voices.length === 0 ? ' disabled' : ''}`}
          onClick={() => { if (voices.length) setActiveTab('voice') }}
          disabled={voices.length === 0}
        >
          Голосові <span className="shared-media-count">{voices.length}</span>
        </button>
      </div>

      {activeTab === 'photo' && (
        <div className="shared-media-grid">
          {photos.slice(0, LIMIT).map(m => {
            const preferFullImage = !!m.media_file
            const mediaKey = `thumb_${m.id}`
            const mediaPath = m.thumbnail || m.media_file
            return (
              <div
                key={m.id}
                className="shared-media-photo"
                onClick={async () => {
                  if (preferFullImage && m.media_file) {
                    const blob = mediaBlobMap[`full_${m.id}`] || await loadMediaBlob(`full_${m.id}`, m.media_file)
                    if (blob) setLightboxSrc(blob)
                  } else if (mediaBlobMap[mediaKey]) {
                    setLightboxSrc(mediaBlobMap[mediaKey])
                  }
                }}
              >
                <AuthMedia
                  mediaKey={mediaKey}
                  mediaPath={mediaPath}
                  type="image"
                  className="shared-media-thumb"
                  token={token}
                  blobMap={mediaBlobMap}
                  loadBlob={loadMediaBlob}
                />
              </div>
            )
          })}
          {photos.length > LIMIT && (
            <div className="shared-media-more">+{photos.length - LIMIT}</div>
          )}
        </div>
      )}

      {activeTab === 'video' && (
        <div className="shared-media-grid">
          {videos.slice(0, LIMIT).map(m => {
            const isVnote = m.media_type === 'video_note'
            return (
              <div
                key={m.id}
                className={`shared-media-photo${isVnote ? ' shared-media-vnote' : ''}`}
                onClick={async () => {
                  if (!m.media_file) return
                  const blobKey = `vid_${m.id}`
                  let src = mediaBlobMap[blobKey]
                  if (!src) src = (await loadMediaBlob(blobKey, m.media_file)) || ''
                  if (src) {
                    if (isVnote) {
                      setVnoteModal({ src, id: m.id })
                      setVnotePlaying(true)
                      setVnoteProgress(0)
                    } else {
                      setLightboxSrc(src)
                    }
                  }
                }}
              >
                {m.thumbnail ? (
                  <AuthMedia
                    mediaKey={`vthumb_${m.id}`}
                    mediaPath={m.thumbnail}
                    type="image"
                    className="shared-media-thumb"
                    token={token}
                    blobMap={mediaBlobMap}
                    loadBlob={loadMediaBlob}
                  />
                ) : (
                  <div className="shared-media-thumb shared-media-thumb-placeholder">🎬</div>
                )}
                <div className="shared-media-play-overlay">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))' }}>
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                </div>
              </div>
            )
          })}
          {videos.length > LIMIT && (
            <div className="shared-media-more">+{videos.length - LIMIT}</div>
          )}
        </div>
      )}

      {activeTab === 'document' && (
        <div className="shared-media-list">
          {documents.slice(0, LIMIT).map(m => {
            const fileName = (m.media_file || '').split('/').pop() || 'Файл'
            const isPdf = (m.media_file || '').toLowerCase().endsWith('.pdf')
            return (
              <div
                key={m.id}
                className="shared-media-doc"
                onClick={() => m.media_file && openMedia(m.media_file, m.media_type, m.id)}
              >
                <span className="shared-media-doc-icon">{isPdf ? '📄' : '📎'}</span>
                <div className="shared-media-doc-info">
                  <span className="shared-media-doc-name">{fileName}</span>
                  <span className="shared-media-doc-date">
                    {new Date(m.message_date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                  </span>
                </div>
                {mediaLoading[`doc_${m.media_file}`] && <div className="spinner-sm" />}
              </div>
            )
          })}
          {documents.length > LIMIT && (
            <div className="shared-media-more">+{documents.length - LIMIT} файлів</div>
          )}
        </div>
      )}

      {activeTab === 'voice' && (
        <div className="shared-media-list">
          {voices.slice(0, LIMIT).map(m => (
            <div key={m.id} className="shared-media-voice-row">
              <VoicePlayer
                messageId={m.id}
                mediaFile={m.media_file}
                blobMap={mediaBlobMap}
                loadBlob={loadMediaBlob}
                loading={!!mediaLoading[`voice_${m.id}`]}
                direction={m.direction}
              />
              <span className="shared-media-voice-date">
                {new Date(m.message_date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}
              </span>
            </div>
          ))}
          {voices.length > LIMIT && (
            <div className="shared-media-more">+{voices.length - LIMIT} голосових</div>
          )}
        </div>
      )}
    </div>
  )
}
