import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { buildId } from './buildInfo';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// the app icon, reused as the toolbar icon
const icon: Plugin = {
  name: 'extension-icon',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'icon.png',
      source: readFileSync(here('../public/icons/icon-192.png')),
    });
  },
};

// `npm run build:extension` → dist-extension/, loaded in Chrome as an unpacked extension.
// Supabase settings come from the project's .env.local, like the app.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, here('..'), 'VITE_'), ...process.env };
  const build = buildId(env);
  return {
    root: here('.'),
    envDir: here('..'),
    base: './',
    define: {
      __BUILD__: JSON.stringify(build),
    },
    plugins: [react(), tailwindcss(), icon],
    build: {
      outDir: here('../dist-extension'),
      emptyOutDir: true,
      rolldownOptions: {
        input: {
          popup: here('popup.html'),
          inline: here('inline.html'),
          background: here('src/background.ts'),
        },
        // the manifest points at background.js by name
        output: {
          entryFileNames: (c) => (c.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        },
      },
    },
  };
});
