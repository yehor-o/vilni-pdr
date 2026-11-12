/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Static site for GitHub Pages under a sub-path: relative base + hash router.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      // Updates wait for the user («Оновити»); registration is done by src/pwa/register.ts
      // (production only), so nothing is injected and dev never gets a service worker.
      registerType: 'prompt',
      injectRegister: false,
      includeManifestIcons: false, // icons are already matched by globPatterns
      devOptions: { enabled: false },
      manifest: {
        name: 'Тренажер ПДР',
        short_name: 'ПДР',
        description: 'Безкоштовний тренажер теоретичного іспиту ПДР, категорія B',
        lang: 'uk',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FFF7EA',
        theme_color: '#FFF7EA',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the whole app: shell, fonts (woff2 only), question data and all images.
        // Largest file is questions.b.json (~0.9 MB), under Workbox's default 2 MiB limit.
        globPatterns: ['**/*.{html,js,css,woff2,json,webp,png,svg}'], // manifest.webmanifest is added by the plugin
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
