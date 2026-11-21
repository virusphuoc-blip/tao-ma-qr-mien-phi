import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Tạo Mã QR Miễn Phí',
        short_name: 'Tạo Mã QR',
        description: 'Tạo mã QR miễn phí ngay trên trình duyệt: VietQR chuyển khoản, WiFi, danh thiếp…',
        lang: 'vi',
        start_url: '/',
        display: 'standalone',
        theme_color: '#6D371A',
        background_color: '#FFFFFF',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
