import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// Builds dist/sw.js from service-worker.js with the list of emitted files to precache,
// so the app shell (and the ballot page) opens offline. Build only: dev has no service worker.
function serviceWorker(): Plugin {
  return {
    name: 'debate-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter(f => /\.(js|css|svg|woff2?)$/.test(f)).map(f => `/${f}`)
      const precache = ['/', '/favicon.svg', '/manifest.webmanifest', ...files]
      const source = readFileSync(path.resolve(import.meta.dirname, 'service-worker.js'), 'utf8')
      // a new build or a changed worker gets a new cache; the old one is dropped on activate
      const version = createHash('sha256').update(precache.join('\n') + source).digest('hex').slice(0, 12)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `const VERSION = '${version}'\nconst PRECACHE = ${JSON.stringify(precache)}\n${source}` })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  // same-origin API in dev: the session cookie just works, no CORS
  server: {
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
})
