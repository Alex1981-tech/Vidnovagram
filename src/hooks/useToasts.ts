import { useCallback, useRef, useState } from 'react'

export interface ToastItem {
  id: number
  clientId: string
  accountId: string
  sender: string
  account: string
  text: string
  hasMedia: boolean
  mediaType: string
  time: number
}

export type ToastAdder = (
  clientId: string,
  accountId: string,
  sender: string,
  account: string,
  text: string,
  hasMedia: boolean,
  mediaType: string,
) => void

export interface ToastController {
  toasts: ToastItem[]
  expandedToastGroup: string | null
  setExpandedToastGroup: (v: string | null) => void
  addToast: ToastAdder
  dismissToast: (id: number) => void
  dismissAll: () => void
}

/**
 * In-app toast stack. Bounded to the last 9 toasts; groups are handled
 * by the consumer (App groups by clientId + accountId for rendering).
 */
export function useToasts(): ToastController {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [expandedToastGroup, setExpandedToastGroup] = useState<string | null>(null)
  const idRef = useRef(0)

  const addToast: ToastAdder = useCallback(
    (clientId, accountId, sender, account, text, hasMedia, mediaType) => {
      const id = ++idRef.current
      setToasts(prev => [
        ...prev.slice(-8),
        { id, clientId, accountId, sender, account, text, hasMedia, mediaType, time: Date.now() },
      ])
    },
    [],
  )

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const dismissAll = useCallback(() => {
    setToasts([])
    setExpandedToastGroup(null)
  }, [])

  return {
    toasts,
    expandedToastGroup,
    setExpandedToastGroup,
    addToast,
    dismissToast,
    dismissAll,
  }
}
