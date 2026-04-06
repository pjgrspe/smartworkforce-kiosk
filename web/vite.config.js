import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'child_process'

let version = 'dev'
try {
  version = execSync('git describe --tags --abbrev=0', { encoding: 'utf8', cwd: '../kiosk-service' }).trim()
} catch (_) {}

// Write VERSION file to kiosk-service so the server can read it at runtime
import { writeFileSync } from 'fs'
try { writeFileSync('../kiosk-service/VERSION', version, 'utf8') } catch (_) {}

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/face-api.js')) return 'face-api'
          if (id.includes('node_modules/framer-motion')) return 'framer-motion'
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react-vendor'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      }
    }
  },
  preview: {
    port: 5173,
    host: true
  }
})
