import { useEffect, useRef, useState } from 'react'
import type { Theme } from '../types'
import { ThemeToggle } from '../components/ThemeToggle'

/** Вхід за номером телефону + кодом з Telegram — той самий флоу, що на
 *  cc.vidnova.app. Пароля більше немає: код приходить у спільний бот клінік
 *  (@Clinical_Photo_bot), у який співробітник колись поділився контактом. */
export function LoginScreen({
  onRequestCode,
  onVerifyCode,
  loading,
  error,
  theme,
  setTheme,
}: {
  onRequestCode: (phone: string) => Promise<boolean>
  onVerifyCode: (phone: string, code: string) => void
  loading: boolean
  error: string
  theme: Theme
  setTheme: (t: Theme) => void
}) {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (codeSent) codeRef.current?.focus()
  }, [codeSent])

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  const phoneValid = phone.replace(/\D/g, '').length >= 10

  const sendCode = async () => {
    if (!phoneValid || loading) return
    const ok = await onRequestCode(phone.trim())
    if (ok) {
      setCodeSent(true)
      setResendIn(30)
      setCode('')
    }
  }

  const submitCode = () => {
    if (code.trim().length >= 4 && !loading) onVerifyCode(phone.trim(), code.trim())
  }

  return (
    <div className="login-wrapper">
      <div className="login-bg" />
      <div className="login-bg-overlay" />
      <div className="login-card">
        <div className="login-card-header">
          <img src="/logo.png" alt="Vidnovagram" className="login-logo" />
          <h1>Vidnovagram</h1>
          <p>Месенджер клініки Віднова</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        {!codeSent ? (
          <>
            <div className="login-field">
              <label>Номер телефону</label>
              <input
                type="tel"
                placeholder="0XX XXX XX XX"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendCode()}
                autoFocus
              />
            </div>
            <button className="login-btn" onClick={sendCode} disabled={loading || !phoneValid}>
              {loading ? 'Надсилаємо…' : 'Отримати код у Telegram'}
            </button>
            <p style={{ fontSize: '0.78rem', opacity: 0.7, textAlign: 'center', marginTop: '0.5rem' }}>
              Код прийде в бот, у якому ви ділилися контактом
            </p>
          </>
        ) : (
          <>
            <div className="login-field">
              <label>Код із Telegram</label>
              <input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                placeholder="6 цифр"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && submitCode()}
              />
            </div>
            <button className="login-btn" onClick={submitCode} disabled={loading || code.trim().length < 4}>
              {loading ? 'Вхід…' : 'Увійти'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.8rem' }}>
              <button className="login-link-btn" onClick={() => { setCodeSent(false); setCode('') }} disabled={loading}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.8, textDecoration: 'underline' }}>
                Змінити номер
              </button>
              <button className="login-link-btn" onClick={sendCode} disabled={loading || resendIn > 0}
                      style={{ background: 'none', border: 'none', cursor: resendIn > 0 ? 'default' : 'pointer', opacity: resendIn > 0 ? 0.45 : 0.8, textDecoration: 'underline' }}>
                {resendIn > 0 ? `Надіслати ще раз (${resendIn}с)` : 'Надіслати ще раз'}
              </button>
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '0.25rem' }}>
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>
      </div>
    </div>
  )
}
