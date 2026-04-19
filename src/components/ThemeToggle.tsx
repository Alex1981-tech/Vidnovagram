import type { Theme } from '../types'
import { SunIcon, MoonIcon, MonitorIcon } from './icons'

export function ThemeToggle({ theme, setTheme }: {
  theme: Theme
  setTheme: (t: Theme) => void
}) {
  const cycle = () => {
    const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
    setTheme(next[theme])
  }
  return (
    <button className="icon-btn" onClick={cycle} title={`Тема: ${theme}`}>
      {theme === 'light' ? <SunIcon /> : theme === 'dark' ? <MoonIcon /> : <MonitorIcon />}
    </button>
  )
}
