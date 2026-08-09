import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { chaperoneApiPlugin } from './server/chaperoneApiPlugin'

export default defineConfig({
  plugins: [react(), chaperoneApiPlugin()],
  server: {
    port: 5173,
  },
})
