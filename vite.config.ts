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
        registerType: 'autoUpdate',
        devOptions: {
          enabled: true
        },
        manifest: {
          id: basePath,
          name: 'Deal Watcher',
          short_name: 'DealWatcher',
          description: 'Monitore promoções de jogos e economize.',
          theme_color: '#171A21',
          background_color: '#171A21',
          display: 'standalone',
          start_url: basePath,
          scope: basePath,
          icons: [
            {
              src: 'https://cdn-icons-png.flaticon.com/512/3258/3258448.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'https://cdn-icons-png.flaticon.com/512/3258/3258448.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
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

