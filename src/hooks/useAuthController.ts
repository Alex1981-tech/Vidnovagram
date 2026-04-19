import { useCallback, useEffect, useState } from 'react'
import { API_BASE, AUTH_KEY } from '../constants'
import type { AuthState } from '../types'

export interface AuthController {
  auth: AuthState | null
  authLoading: boolean
  authError: string
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

/**
 * Owns `auth` state, its localStorage persistence, and the login/logout
 * network flow. Calling `logout()` also invokes the caller-provided
 * `onLogout` so App can reset messenger state (contacts, messages, etc.).
 */
export function useAuthController({ onLogout }: { onLogout?: () => void } = {}): AuthController {
  const [auth, setAuth] = useState<AuthState | null>(() => {
    try {
      const saved = localStorage.getItem(AUTH_KEY)
      if (saved) return JSON.parse(saved)
    } catch {
      // corrupt localStorage — fall through
    }
    return null
  })
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    if (auth?.authorized) {
      localStorage.setItem(AUTH_KEY, JSON.stringify(auth))
    } else {
      localStorage.removeItem(AUTH_KEY)
    }
  }, [auth])

  const logout = useCallback(() => {
    setAuth(null)
    localStorage.removeItem(AUTH_KEY)
    onLogout?.()
  }, [onLogout])

  const login = useCallback(async (username: string, password: string) => {
    setAuthLoading(true)
    setAuthError('')
    try {
      const resp = await fetch(`${API_BASE}/vidnovagram/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await resp.json()
      if (data.status === 'ok' && data.token) {
        setAuth({
          authorized: true,
          name: data.name || username,
          token: data.token,
          isAdmin: data.is_admin || false,
        })
      } else {
        setAuthError(data.error || 'Невірний логін або пароль')
      }
    } catch {
      setAuthError("Помилка з'єднання з сервером")
    } finally {
      setAuthLoading(false)
    }
  }, [])

  return { auth, authLoading, authError, login, logout }
}
