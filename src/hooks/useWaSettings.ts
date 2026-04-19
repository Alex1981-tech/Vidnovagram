import { useCallback, useEffect, useRef, useState } from 'react'
import { API_BASE } from '../constants'
import { authFetch } from '../utils/authFetch'

export interface WaAccount {
  id: string
  label: string
  phone: string
  status: string
  wa_name: string
  error_message: string
}

export interface WaSettingsController {
  accounts: WaAccount[]
  qrAccountId: string | null
  qrImage: string | null
  qrStatus: string
  creating: boolean
  newLabel: string
  setNewLabel: (v: string) => void
  load: () => Promise<void>
  create: () => Promise<void>
  remove: (id: string) => Promise<void>
  startQr: (accountId: string) => Promise<void>
  stopQr: () => void
}

/**
 * WhatsApp settings tab: account list + create/delete + QR login polling.
 * After any change calls the optional `onAccountsChanged` so the header
 * accounts list (useAccounts) can refresh too.
 */
export function useWaSettings({
  token,
  onAccountsChanged,
}: {
  token: string | undefined
  onAccountsChanged?: () => void | Promise<void>
}): WaSettingsController {
  const [accounts, setAccounts] = useState<WaAccount[]>([])
  const [qrAccountId, setQrAccountId] = useState<string | null>(null)
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [qrStatus, setQrStatus] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    try {
      const resp = await authFetch(`${API_BASE}/whatsapp/accounts/`, token)
      if (resp.ok) {
        const data = await resp.json()
        const list = Array.isArray(data) ? data : data.results || []
        setAccounts(list)
      }
    } catch (e) {
      console.error('WA settings load:', e)
    }
  }, [token])

  const create = useCallback(async () => {
    if (!token || !newLabel.trim()) return
    setCreating(true)
    try {
      const resp = await authFetch(`${API_BASE}/whatsapp/accounts/`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel.trim() }),
      })
      if (resp.ok) {
        setNewLabel('')
        await load()
      }
    } catch (e) {
      console.error('WA create:', e)
    } finally {
      setCreating(false)
    }
  }, [token, newLabel, load])

  const remove = useCallback(async (id: string) => {
    if (!token) return
    try {
      await authFetch(`${API_BASE}/whatsapp/accounts/${id}/`, token, { method: 'DELETE' })
      await load()
      await onAccountsChanged?.()
    } catch (e) {
      console.error('WA delete:', e)
    }
  }, [token, load, onAccountsChanged])

  const startQr = useCallback(async (accountId: string) => {
    if (!token) return
    setQrAccountId(accountId)
    setQrImage(null)
    setQrStatus('starting')
    try {
      const resp = await authFetch(`${API_BASE}/whatsapp/accounts/${accountId}/qr/`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      })
      if (resp.ok) {
        const data = await resp.json()
        setQrStatus(data.status || 'pending')
        if (data.qr_image) setQrImage(data.qr_image)
      }
    } catch (e) {
      console.error('WA QR start:', e)
    }

    if (qrPollRef.current) clearInterval(qrPollRef.current)
    qrPollRef.current = setInterval(async () => {
      try {
        const resp = await authFetch(`${API_BASE}/whatsapp/accounts/${accountId}/qr/`, token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check' }),
        })
        if (resp.ok) {
          const data = await resp.json()
          setQrStatus(data.status || 'pending')
          if (data.qr_image) setQrImage(data.qr_image)
          if (data.status === 'connected') {
            if (qrPollRef.current) clearInterval(qrPollRef.current)
            qrPollRef.current = null
            setQrAccountId(null)
            await load()
            await onAccountsChanged?.()
          }
        }
      } catch {
        // poll errors — keep trying
      }
    }, 3000)
  }, [token, load, onAccountsChanged])

  const stopQr = useCallback(() => {
    if (qrPollRef.current) {
      clearInterval(qrPollRef.current)
      qrPollRef.current = null
    }
    setQrAccountId(null)
    setQrImage(null)
    setQrStatus('')
  }, [])

  useEffect(() => () => {
    if (qrPollRef.current) clearInterval(qrPollRef.current)
  }, [])

  return {
    accounts,
    qrAccountId,
    qrImage,
    qrStatus,
    creating,
    newLabel,
    setNewLabel,
    load,
    create,
    remove,
    startQr,
    stopQr,
  }
}
