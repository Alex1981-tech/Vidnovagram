interface Reaction {
  emoji: string
  count: number
  chosen?: boolean
}

interface Props {
  reactions: Reaction[]
  selectedClient: string | null
  clientPhotoUrl?: string
  clientInitial: string
}

/**
 * Emoji reactions strip below a message bubble. Own reactions ("chosen") are
 * rendered without avatar; partner reactions show the partner avatar or initial.
 */
export function ReactionsRow({ reactions, selectedClient, clientPhotoUrl, clientInitial }: Props) {
  if (!reactions || reactions.length === 0) return null

  return (
    <div className="msg-reactions">
      {reactions.map((r, i) => (
        <span key={i} className={`msg-reaction${r.chosen ? ' chosen' : ''}`}>
          {!r.chosen && selectedClient && clientPhotoUrl ? (
            <img src={clientPhotoUrl} className="reaction-avatar" alt="" />
          ) : !r.chosen ? (
            <span className="reaction-avatar reaction-avatar-placeholder">
              {clientInitial}
            </span>
          ) : null}
          <span className="reaction-emoji">{r.emoji}</span>
          {r.count > 1 ? ` ${r.count}` : ''}
        </span>
      ))}
    </div>
  )
}
