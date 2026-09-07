import { useCallback, useEffect, useRef, useState } from 'react'
import { API_BASE, AUTH_KEY } from '../constants'
import type { AuthState } from '../types'

export interface AuthController {
  auth: AuthState | null
  authLoading: boolean
  authError: string
  /** Крок 1: надіслати код входу в Telegram (через спільний бот клінік). */
  requestCode: (phone: string) => Promise<boolean>
  /** Крок 2: перевірити код → отримати DesktopSession-токен. */
  verifyCode: (phone: string, code: string) => Promise<void>
  logout: () => void
}

/** `YYYY-MM-DD` in the user's local timezone — the "calendar date". */
function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Owns `auth` state, its localStorage persistence, and the login/logout
 * network flow. Calling `logout()` also invokes the caller-provided
 * `onLogout` so App can reset messenger state (contacts, messages, etc.).
 *
 * Session policy: VG requires ONE login per local calendar day. Stored
 * `auth.loginDate` is compared to today; if it's stale (or missing on a
 * pre-existing session from an old build), we drop the session and force
 * a fresh login. A local timer also forces logout right at midnight if the
 * app was left open overnight.
 */
export function useAuthController({ onLogout }: { onLogout?: () => void } = {}): AuthController {
  const [auth, setAuth] = useState<AuthState | null>(() => {
    try {
      const saved = localStorage.getItem(AUTH_KEY)
      if (!saved) return null
      const parsed = JSON.parse(saved) as AuthState
      // Day-scoped session: require re-login on a new calendar day.
      if (!parsed.loginDate || parsed.loginDate !== todayLocal()) {
        localStorage.removeItem(AUTH_KEY)
        return null
      }
      return parsed
    } catch {
      // corrupt localStorage — fall through
    }
    return null
  })
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const onLogoutRef = useRef(onLogout)
  useEffect(() => { onLogoutRef.current = onLogout })

  useEffect(() => {
    if (auth?.authorized) {
      localStorage.setItem(AUTH_KEY, JSON.stringify(auth))
    } else {
      localStorage.removeItem(AUTH_KEY)
    }
  }, [auth])

  // Force logout at midnight (and re-arm for the next day) if session is
  // still active. Also guards against suspend/resume by checking on wake.
  useEffect(() => {
    if (!auth?.authorized) return
    const schedule = (): (() => void) => {
      const now = new Date()
      const next = new Date(
        now.getFullYear(), now.getMonth(), now.getDate() + 1,
        0, 0, 1, 0,
      )
      const delay = Math.max(5000, next.getTime() - now.getTime())
      const t = setTimeout(() => {
        setAuth(null)
        localStorage.removeItem(AUTH_KEY)
        onLogoutRef.current?.()
      }, delay)
      return () => clearTimeout(t)
    }
    const cancel = schedule()
    // If laptop was asleep and we cross midnight while suspended, onfocus
    // / visibility catch it.
    const onWake = () => {
      if (auth.loginDate && auth.loginDate !== todayLocal()) {
        setAuth(null)
        localStorage.removeItem(AUTH_KEY)
        onLogoutRef.current?.()
      }
    }
    window.addEventListener('focus', onWake)
    document.addEventListener('visibilitychange', onWake)
    return () => {
      cancel()
      window.removeEventListener('focus', onWake)
      document.removeEventListener('visibilitychange', onWake)
    }
  }, [auth])

  const logout = useCallback(() => {
    setAuth(null)
    localStorage.removeItem(AUTH_KEY)
    onLogout?.()
  }, [onLogout])

  // Вхід за номером + кодом у Telegram — той самий флоу, що на
  // cc.vidnova.app (парольний вхід у CC вимкнено 07.09.2026).
  const requestCode = useCallback(async (phone: string): Promise<boolean> => {
    setAuthLoading(true)
    setAuthError('')
    try {
      const resp = await fetch(`${API_BASE}/vidnovagram/request-code/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      if (!resp.ok) {
        setAuthError('Не вдалося надіслати код, спробуйте ще раз')
        return false
      }
      return true
    } catch {
      setAuthError("Помилка з'єднання з сервером")
      return false
    } finally {
      setAuthLoading(false)
    }
  }, [])

  const verifyCode = useCallback(async (phone: string, code: string) => {
    setAuthLoading(true)
    setAuthError('')
    try {
      const resp = await fetch(`${API_BASE}/vidnovagram/verify-code/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, device_name: 'Vidnovagram Desktop' }),
      })
      const data = await resp.json()
      if (data.status === 'ok' && data.token) {
        setAuth({
          authorized: true,
          name: data.name || phone,
          token: data.token,
          isAdmin: data.is_admin || false,
          loginDate: todayLocal(),
        })
      } else {
        setAuthError(data.error || 'Невірний код')
      }
    } catch {
      setAuthError("Помилка з'єднання з сервером")
    } finally {
      setAuthLoading(false)
    }
  }, [])

  return { auth, authLoading, authError, requestCode, verifyCode, logout }
}
