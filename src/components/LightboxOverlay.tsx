import { useEffect, useRef, useState } from 'react'

interface Props {
  src: string | null
  onClose: () => void
}

/**
 * Fullscreen image viewer with wheel-zoom (0.5..8x), drag-to-pan while zoomed,
 * double-click toggle between 1x and 3x. Clicking the backdrop closes; suppressed
 * if a drag was just finishing (prevents accidental close while panning).
 */
export function LightboxOverlay({ src, onClose }: Props) {
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const didDrag = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const scaleRef = useRef(1)

  useEffect(() => {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
    scaleRef.current = 1
  }, [src])

  if (!src) return null

  const reset = () => {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
    scaleRef.current = 1
  }

  return (
    <div
      className="lightbox"
      onClick={() => {
        if (didDrag.current) { didDrag.current = false; return }
        onClose()
        reset()
      }}
      onMouseMove={e => {
        if (!dragging.current) return
        e.stopPropagation()
        const dx = e.clientX - lastPos.current.x
        const dy = e.clientY - lastPos.current.y
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag.current = true
        setTranslate(t => ({ x: t.x + dx, y: t.y + dy }))
        lastPos.current = { x: e.clientX, y: e.clientY }
      }}
      onMouseUp={() => { dragging.current = false }}
      onMouseLeave={() => { dragging.current = false }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          cursor: scale > 1 ? 'grab' : 'zoom-in',
          transition: dragging.current ? 'none' : 'transform 0.15s ease',
        }}
        onClick={e => e.stopPropagation()}
        onWheel={e => {
          e.stopPropagation()
          setScale(s => {
            const d = e.deltaY > 0 ? -0.15 : 0.15
            const next = Math.max(0.5, Math.min(8, s + d * s))
            scaleRef.current = next
            if (next <= 1) setTranslate({ x: 0, y: 0 })
            return next
          })
        }}
        onMouseDown={e => {
          if (scaleRef.current <= 1) return
          e.preventDefault()
          e.stopPropagation()
          dragging.current = true
          didDrag.current = false
          lastPos.current = { x: e.clientX, y: e.clientY }
        }}
        onDoubleClick={e => {
          e.stopPropagation()
          if (scaleRef.current > 1) {
            setScale(1)
            setTranslate({ x: 0, y: 0 })
            scaleRef.current = 1
          } else {
            setScale(3)
            scaleRef.current = 3
          }
        }}
      />
    </div>
  )
}
