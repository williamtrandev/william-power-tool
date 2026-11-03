import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// everything the extension bundles: a change in any of these is a new build; app-only code (src/tools) is not
const INPUTS = ['extension/src', 'extension/public', 'extension/popup.html', 'extension/inline.html', 'src/lib', 'src/components', 'src/index.css', 'src/fonts.css', 'package-lock.json'];

const walk = (p: string): string[] => (statSync(p).isDirectory() ? readdirSync(p).sort().flatMap((f) => walk(join(p, f))) : [p]);

/** where the web app is deployed — the extension looks for new builds there. Vercel provides its production URL. */
export function appUrl(env: Record<string, string | undefined>) {
  const url = env.VITE_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : '');
  return url.replace(/\/+$/, '');
}

/** a fingerprint of the sources and settings the extension is built from: same inputs, same id */
export function buildId(env: Record<string, string | undefined>) {
  const h = createHash('sha256');
  for (const input of INPUTS) {
    const p = join(ROOT, input);
    if (!existsSync(p)) continue;
    for (const f of walk(p)) h.update(f.slice(ROOT.length)).update(readFileSync(f));
  }
  h.update(`${env.VITE_SUPABASE_URL ?? ''}|${env.VITE_SUPABASE_ANON_KEY ?? ''}|${appUrl(env)}`);
  return h.digest('hex').slice(0, 12);
}

export const manifestVersion = () => (JSON.parse(readFileSync(join(ROOT, 'extension/public/manifest.json'), 'utf8')) as { version: string }).version;
