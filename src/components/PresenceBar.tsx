import type { PresenceViewer } from '../hooks/useOperatorPresence'

interface Props {
  viewers: PresenceViewer[]
}

/**
 * Тонка плашка над input-ом: показує хто з інших операторів
 * зараз відкрив цей чат або набирає. Самого юзера в списку немає —
 * self-filter зроблено в useOperatorPresence.
 *
 * Правила показу:
 * - Хтось набирає → "Настя набирає…" (з анімацією трьох крапок).
 * - Кілька набирають → "Настя і Олена набирають…".
 * - Тільки дивляться → "Настя дивиться в чаті".
 * - Міксовано → "Настя (набирає), Олена".
 */
export function PresenceBar({ viewers }: Props) {
  if (!viewers || viewers.length === 0) return null

  const typing = viewers.filter(v => v.is_typing)
  const watching = viewers.filter(v => !v.is_typing)

  const fmt = (list: PresenceViewer[]) => list.map(v => v.name || '—').join(', ')

  let label: React.ReactNode = null
  if (typing.length > 0 && watching.length === 0) {
    label = (
      <>
        <span className="presence-name">{fmt(typing)}</span>
        <span className="presence-verb"> {typing.length > 1 ? 'набирають' : 'набирає'}</span>
        <span className="presence-dots"><span>.</span><span>.</span><span>.</span></span>
      </>
    )
  } else if (watching.length > 0 && typing.length === 0) {
    label = (
      <>
        <span className="presence-name">{fmt(watching)}</span>
        <span className="presence-verb"> {watching.length > 1 ? 'відкрили' : 'відкрила'} чат</span>
      </>
    )
  } else {
    // Mixed: typing users inline-marked "(набирає)", watchers plain.
    label = (
      <>
        {typing.map((v, i) => (
          <span key={`t-${v.user_id}`}>
            <span className="presence-name">{v.name || '—'}</span>
            <span className="presence-verb"> (набирає)</span>
            {(i < typing.length - 1 || watching.length > 0) ? ', ' : ''}
          </span>
        ))}
        {watching.map((v, i) => (
          <span key={`w-${v.user_id}`}>
            <span className="presence-name">{v.name || '—'}</span>
            {i < watching.length - 1 ? ', ' : ''}
          </span>
        ))}
      </>
    )
  }

  return (
    <div className="presence-bar" role="status" aria-live="polite">
      <span className="presence-icon">
        {typing.length > 0 ? (
          // pencil — typing
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
          </svg>
        ) : (
          // eye — watching
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/>
          </svg>
        )}
      </span>
      <span className="presence-text">{label}</span>
    </div>
  )
}
