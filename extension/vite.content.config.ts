import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The content script is a classic script (no imports allowed), so it gets its own one-file build next to the extension's.
export default defineConfig({
  root: here('.'),
  envDir: here('..'),
  build: {
    outDir: here('../dist-extension'),
    emptyOutDir: false,
    lib: { entry: here('src/content.ts'), formats: ['iife'], name: 'wptContent', fileName: () => 'content.js' },
  },
});
