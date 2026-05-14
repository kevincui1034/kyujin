import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const globalForDb = globalThis as unknown as {
  db?: ReturnType<typeof createDb>;
  client?: ReturnType<typeof postgres>;
};

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Run `vercel env pull` or set it in .env.local.');
  }
  const client =
    globalForDb.client ??
    postgres(url, {
      max: 1,
      prepare: false,
      idle_timeout: 20,
    });
  if (!globalForDb.client) globalForDb.client = client;
  return drizzle(client, { schema, logger: process.env.DB_DEBUG === '1' });
}

export const db = globalForDb.db ?? createDb();
if (!globalForDb.db) globalForDb.db = db;

export { schema };
export type Database = typeof db;
