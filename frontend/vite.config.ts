import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Import from the app root with "@/..." (e.g. "@/components/ui/Button")
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
