type TauriWindow = Window & {
  __TAURI__?: unknown
  __TAURI_INTERNALS__?: unknown
}

export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as TauriWindow
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__)
}
