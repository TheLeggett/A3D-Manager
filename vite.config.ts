import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const isStaticBuild = process.env.VITE_MODE === 'static'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Only enable PWA in static build mode
    isStaticBuild && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'icons/*.png',
        'data/*.json',
        '*.png',  // Root level images (welcome, onboarding, etc.)
      ],
      manifest: false, // We use our own manifest.json in public/
      workbox: {
        // Cache all static assets including images
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,json}'],
        // Increase limit to cache larger onboarding images
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
        // Cache the cart-names.json database
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\/data\/cart-names\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cart-names-cache',
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
            },
          },
          {
            // Cache label images from IndexedDB (served as blob URLs)
            urlPattern: /^blob:/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'label-images-cache',
              expiration: {
                maxEntries: 1000,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // Disable in dev for faster builds
      },
    }),
  ].filter(Boolean),
  define: {
    // Make VITE_MODE available at runtime
    'import.meta.env.VITE_MODE': JSON.stringify(process.env.VITE_MODE || ''),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Optimize chunk sizes
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-pwa': ['pica', 'jszip', 'idb'],
        },
      },
    },
  },
})
