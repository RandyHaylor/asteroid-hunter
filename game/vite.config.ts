import { defineConfig } from 'vite'

// GitHub Pages serves the app from /asteroid-hunter/ — dev server stays at /
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/asteroid-hunter/' : '/',
}))
