import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Production (and local) mount path — must match Nginx `location /calc/` */
const BASE = '/calc/'

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id: string) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  base: BASE,
  plugins: [
    figmaAssetResolver(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Регистрация вручную в main.tsx (online/visibility → update)
      injectRegister: false,
      includeAssets: [
        'favicon.ico',
        'robots.txt',
        'icons/*.png',
        'manifest.webmanifest',
      ],
      manifest: {
        name: 'Учёт разметки',
        short_name: 'Разметка',
        description: 'Учёт смен и расчёт зарплаты бригад дорожной разметки',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#ffffff',
        theme_color: '#FF6B00',
        lang: 'ru',
        icons: [
          {
            src: `${BASE}icons/icon-192.png`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `${BASE}icons/icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `${BASE}icons/icon-192-maskable.png`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: `${BASE}icons/icon-512-maskable.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell only — data cache lives in IndexedDB (Block 2)
        // navigateFallback (NavigationRoute) в generateSW регистрируется РАНЬШЕ
        // runtimeCaching → NetworkFirst не срабатывал. Offline SPA: NetworkFirst
        // кэширует ответ navigate в html-shell (start_url после первого онлайна).
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,ico,png,svg,webmanifest,woff2}'],
        runtimeCaching: [
          {
            // Онлайн → свежий shell; офлайн → кэш (timeout 3s)
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-shell',
              networkTimeoutSeconds: 3,
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
