import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    build: {
      lib: { entry: 'electron/main/index.ts' }
    }
  },
  preload: {
    build: {
      lib: { entry: 'electron/preload/index.ts' }
    }
  },
  renderer: {
    base: './',
    root: '.',
    build: {
      rollupOptions: { input: 'index.html' }
    },
    plugins: [react()]
  }
})
