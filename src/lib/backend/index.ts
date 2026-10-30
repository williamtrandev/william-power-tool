import { demoBackend } from './demo';
import { supabaseBackend } from './supabase';
import type { Backend } from './types';

/**
 * Google sign-in, accounts and the shared command library on Supabase (schema and access rules: supabase/setup.sql).
 * The project is chosen at build time with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 * (.env.local, never committed). VITE_SUPABASE_URL=demo runs a local fake, `npm run dev` only.
 */

export type * from './types';

const env = import.meta.env as Record<string, string | undefined>;

/** null when the build has no Supabase settings */
export function createBackend(): Backend | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  if (!url) return null;
  // the fake backend has no passwords — only ever available on a local dev server, and
  // stripped from production builds
  if (url === 'demo') return import.meta.env.DEV ? demoBackend() : null;
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  return key ? supabaseBackend(url, key) : null;
}
