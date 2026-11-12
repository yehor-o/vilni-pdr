/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * Version of the offline image set: a hash of every image referenced by the
 * question data of all categories (name + bytes). It stays the same for app-only deploys, so
 * cached images are not downloaded again; any added, removed or changed image
 * gives a new version and a new image cache.
 */
function imageDataVersion(): string {
  const bank = JSON.parse(readFileSync(`${root}public/data/questions.json`, 'utf8')) as {
    topics: { questions: { images: string[] }[] }[];
  };
  const names = new Set<string>();
  for (const t of bank.topics) for (const q of t.questions) for (const i of q.images) names.add(i);
  const hash = createHash('sha256');
  for (const name of [...names].sort()) {
    hash.update(name);
    hash.update(readFileSync(`${root}public/img/${name}`));
  }
  return hash.digest('hex').slice(0, 12);
}

const IMAGE_VERSION = imageDataVersion();
const SW_IMAGES_FILE = `sw-images-${IMAGE_VERSION}.js`;

/** Emits the service worker's image route with the data version baked in. */
function swImagesPlugin(): Plugin {
  return {
    name: 'sw-images',
    apply: 'build',
    generateBundle() {
      const source = readFileSync(`${root}src/pwa/sw-images.js`, 'utf8').replaceAll(
        "'__IMAGE_DATA_VERSION__'",
        JSON.stringify(IMAGE_VERSION),
      );
      if (source.includes('__IMAGE_DATA_VERSION__')) this.error('sw-images.js: version placeholder not replaced');
      this.emitFile({ type: 'asset', fileName: SW_IMAGES_FILE, source });
    },
  };
}

// Static site for GitHub Pages under a sub-path: relative base + hash router.
export default defineConfig({
  base: './',
  define: { __IMAGE_DATA_VERSION__: JSON.stringify(IMAGE_VERSION) },
  plugins: [
    react(),
    swImagesPlugin(),
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
        description: 'Безкоштовний тренажер теоретичного іспиту ПДР, категорії A, B, C, D, T',
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
        // Precache only the app shell + question data (fast install). Question images
        // are served by the cache-first route in sw-images-<version>.js and downloaded
        // in the background by the app (src/pwa/imageCache.ts).
        globPatterns: ['**/*.{html,js,css,woff2,json,png,svg}'], // manifest.webmanifest is added by the plugin
        globIgnores: ['sw-images-*.js'],
        importScripts: [SW_IMAGES_FILE],
        cleanupOutdatedCaches: true,
        clientsClaim: true, // first visit: control the open tab right away (updates still wait for «Оновити»)
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
