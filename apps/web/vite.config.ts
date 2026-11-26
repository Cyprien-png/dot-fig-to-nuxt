import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const api = `http://127.0.0.1:${process.env.FIG2NUXT_PORT ?? 4310}`

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 4311,
    proxy: { '/api': api },
  },
})
