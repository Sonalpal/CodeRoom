import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),tailwindcss()],
   resolve: {
    alias: [
      {
        find: /^monaco-editor\/esm\/vs\/editor\/editor\.api(\.js)?$/,
        replacement: 'monaco-editor',
      },
    ],  dedupe: ['yjs'],
  },
   optimizeDeps: {
    include: ['yjs', 'y-websocket', 'y-monaco'],
  },
})
