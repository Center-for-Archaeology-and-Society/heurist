import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const heuristServer = process.env.HEURIST_SERVER || 'http://localhost/heurist'

export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    port: 5175,
    proxy: {
      '/api': { target: heuristServer, changeOrigin: true },
      '/hserv': { target: heuristServer, changeOrigin: true },
      '/fileDownload.php': { target: heuristServer, changeOrigin: true }
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('leaflet')) {
            return 'leaflet'
          }
          if (id.includes('@zxing')) {
            return 'zxing'
          }
          if (id.includes('node_modules')) {
            return 'vendor'
          }
        }
      }
    }
  }
})
