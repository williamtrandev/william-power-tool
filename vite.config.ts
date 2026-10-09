import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` emits a single self-contained dist/index.html (JS, CSS, fonts, worker inlined)
// that can be opened directly or dropped on any static host.
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  base: './',
  build: { assetsInlineLimit: 100_000_000 },
});
