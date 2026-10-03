import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'FoodOder',
        short_name: 'FoodOder',
        description: 'Say what you want to cook. It checks your stock and builds a basket for your approval.',
        theme_color: '#1F6B3A',
        background_color: '#F7F6F2',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [{ urlPattern: /\/api\/.*/, handler: 'NetworkFirst', options: { cacheName: 'api', networkTimeoutSeconds: 5 } }],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
  },
});
