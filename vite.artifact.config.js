import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Builds the whole dashboard into ONE self-contained HTML file
// (dist-single/index.html) — handy for sharing a preview anywhere
// without hosting. `npm run build:single`
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  build: {
    outDir: 'dist-single',
  },
})
