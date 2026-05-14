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

// Lazy proxy — defers the `DATABASE_URL` check and Postgres connection until
// the first DB call. Importing this module during `next build` or in a route
// that never touches the DB doesn't pay the cost or hit the env-var check.
export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    if (!globalForDb.db) globalForDb.db = createDb();
    return Reflect.get(globalForDb.db, prop, receiver);
  },
});

export { schema };
export type Database = DrizzleDb;
