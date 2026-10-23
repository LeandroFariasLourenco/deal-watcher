import tailwindcss from '@tailwindcss/vite';
import angular from '@analogjs/vite-plugin-angular';
import path from 'path';
import {defineConfig} from 'vite';

import { VitePWA } from 'vite-plugin-pwa';

const isGitHubPages = process.env.GITHUB_PAGES === 'true';
const pagesBasePath = process.env.VITE_BASE_PATH?.trim();
const basePath =
  isGitHubPages && pagesBasePath
    ? pagesBasePath.endsWith('/')
      ? pagesBasePath
      : `${pagesBasePath}/`
    : isGitHubPages
      ? '/deal-watcher/'
      : '/';

export default defineConfig(() => {
  return {
    base: basePath,
    plugins: [
      angular(),
      tailwindcss(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'autoUpdate',
        includeAssets: [
          'icons/favicon-32x32.png',
          'icons/icon-192.png',
          'icons/icon-512.png',
          'icons/stores/*.png',
          'icons/stores/*.jpg'
        ],
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,webp}']
        },
        devOptions: {
          enabled: true,
          type: 'module'
        },
        manifest: {
          id: basePath,
          name: 'Vigia de Ofertas',
          short_name: 'Ofertas',
          description: 'Monitore promoções de jogos e economize.',
          theme_color: '#171A21',
          background_color: '#171A21',
          display: 'standalone',
          start_url: basePath,
          scope: basePath,
          icons: [
            {
              src: 'icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        }
      })
    ],
    build: {
      outDir: 'dist',
      target: 'es2022',
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 3000,
      strictPort: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    optimizeDeps: {
      optimizer: 'esbuild',
      include: ['@angular/common', '@angular/forms', 'primeng/api', 'primeng/button', '@angular/core', '@angular/platform-browser']
    }
  };
});

