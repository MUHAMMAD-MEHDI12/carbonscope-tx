import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' makes the build path-relative, so it deploys cleanly to
// GitHub Pages under any repository name (https://<user>.github.io/<repo>/).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
  },
})
