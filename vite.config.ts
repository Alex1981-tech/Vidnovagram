import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // lottie-web + pako + tauri api/app are split out via dynamic imports, so
    // the remaining main chunk (~510 kB) is expected. Raise the threshold so
    // the warning only fires on genuine bloat, not the current baseline.
    chunkSizeWarningLimit: 600,
  },
})
