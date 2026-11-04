import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { buildId } from './buildInfo';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The content script is a classic script (no imports allowed), so it gets its own one-file build next to the extension's.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, here('..'), 'VITE_'), ...process.env };
  return {
    root: here('.'),
    envDir: here('..'),
    define: {
      __BUILD__: JSON.stringify(buildId(env)),
    },
    build: {
      outDir: here('../dist-extension'),
      emptyOutDir: false,
      lib: {
        entry: here('src/content.ts'),
        formats: ['iife'],
        name: 'wptContent',
        fileName: () => 'content.js',
      },
    },
  };
});
