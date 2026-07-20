import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,        // Exposes to LAN
    port: 5173,
    strictPort: true,
    // ✅ Remove the 'hmr' block entirely.
    // Vite will automatically set the websocket to the correct host.
  },
})