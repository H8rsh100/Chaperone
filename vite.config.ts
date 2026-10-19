import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { chaperoneApiPlugin } from './server/chaperoneApiPlugin'

export default defineConfig({
  plugins: [react(), chaperoneApiPlugin()],
  server: {
    port: 5174,
    // Fail loudly instead of silently moving to 5175: the demo fixture and the
    // pre-stage checklist assume a stable origin.
    strictPort: true,
  },
})
