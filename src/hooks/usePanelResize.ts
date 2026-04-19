import { useEffect, useRef, useState } from 'react'

export interface PanelResize {
  sidebarWidth: number
  rightPanelWidth: number
  startResize: (panel: 'sidebar' | 'right', e: React.MouseEvent) => void
}

const SIDEBAR_KEY = 'vg_sidebar_w'
const RPANEL_KEY = 'vg_rpanel_w'
const SIDEBAR_MIN = 220
const SIDEBAR_MAX = 500
const RPANEL_MIN = 200
const RPANEL_MAX = 500

/**
 * Owns the drag-to-resize behaviour for the left sidebar and the right panel.
 * Persists the final width in localStorage so widths survive restarts.
 */
export function usePanelResize(): PanelResize {
  const [sidebarWidth, setSidebarWidth] = useState(
    () => Number(localStorage.getItem(SIDEBAR_KEY)) || 320,
  )
  const [rightPanelWidth, setRightPanelWidth] = useState(
    () => Number(localStorage.getItem(RPANEL_KEY)) || 300,
  )
  const resizingRef = useRef<'sidebar' | 'right' | null>(null)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return
      const dx = e.clientX - startXRef.current
      if (resizingRef.current === 'sidebar') {
        setSidebarWidth(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, startWidthRef.current + dx)))
      } else {
        setRightPanelWidth(Math.max(RPANEL_MIN, Math.min(RPANEL_MAX, startWidthRef.current - dx)))
      }
    }
    const onMouseUp = () => {
      if (resizingRef.current === 'sidebar') {
        localStorage.setItem(
          SIDEBAR_KEY,
          String(Math.round(document.querySelector('.sidebar')?.getBoundingClientRect().width ?? 320)),
        )
      }
      if (resizingRef.current === 'right') {
        localStorage.setItem(
          RPANEL_KEY,
          String(Math.round(document.querySelector('.right-panel')?.getBoundingClientRect().width ?? 300)),
        )
      }
      resizingRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const startResize = (panel: 'sidebar' | 'right', e: React.MouseEvent) => {
    resizingRef.current = panel
    startXRef.current = e.clientX
    startWidthRef.current = panel === 'sidebar' ? sidebarWidth : rightPanelWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return { sidebarWidth, rightPanelWidth, startResize }
}
