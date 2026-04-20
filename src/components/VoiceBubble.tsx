import { VoicePlayer } from './VoicePlayer'
import type { ChatMessage } from '../types'

interface Props {
  message: ChatMessage
  mediaBlobMap: Record<string, string>
  mediaLoading: Record<string, boolean>
  loadMediaBlob: (key: string, mediaPath: string) => Promise<string | null>
}

/** Thin wrapper around VoicePlayer for voice messages. */
export function VoiceBubble({ message: m, mediaBlobMap, mediaLoading, loadMediaBlob }: Props) {
  if (!m.media_file) return null
  return (
    <VoicePlayer
      messageId={m.id}
      mediaFile={m.media_file}
      blobMap={mediaBlobMap}
      loadBlob={loadMediaBlob}
      loading={!!mediaLoading[`voice_${m.id}`]}
      direction={m.direction}
    />
  )
}
