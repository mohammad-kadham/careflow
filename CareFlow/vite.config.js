import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { blogContent } from './scripts/blog-content.mjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), blogContent()],
})
