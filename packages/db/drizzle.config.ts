import { defineConfig } from 'drizzle-kit';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// DATABASE_URL lives in apps/web/.env.local (single source of truth for env).
// Drizzle-kit runs from packages/db, so it won't see that file unless we load
// it explicitly. Requires Node 20.6+ for process.loadEnvFile.
if (!process.env.DATABASE_URL) {
  const here = dirname(fileURLToPath(import.meta.url));
  try {
    process.loadEnvFile(resolve(here, '../../apps/web/.env.local'));
  } catch {
    // fall through to the explicit error below
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL must be set. Add it to apps/web/.env.local or export it before running drizzle-kit.');
}

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  // Supabase databases ship with auth/storage/realtime schemas whose CHECK
  // constraints crash drizzle-kit's parser. Limit introspection to public.
  schemaFilter: ['public'],
  strict: true,
  verbose: true,
});
