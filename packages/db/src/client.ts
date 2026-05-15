import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  db?: DrizzleDb;
  client?: ReturnType<typeof postgres>;
};

function createDb(): DrizzleDb {
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

// Eager init. A lazy Proxy here breaks `instanceof PgDatabase` checks inside
// Auth.js's Drizzle adapter (dialect detection), so we accept that importing
// this module requires `DATABASE_URL` to be set.
export const db: DrizzleDb = globalForDb.db ?? createDb();
if (!globalForDb.db) globalForDb.db = db;

export { schema };
export type Database = DrizzleDb;
