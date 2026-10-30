import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 8000, // keeps the previously shared localhost link
  },
  build: {
    target: 'es2022',
  },
})
