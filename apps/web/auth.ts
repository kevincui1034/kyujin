import NextAuth, { type DefaultSession } from 'next-auth';
// Side-effect import so TS can resolve the submodule before the
// `declare module 'next-auth/jwt'` augmentation below.
import 'next-auth/jwt';
import { eq } from 'drizzle-orm';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@kyujin/db/client';
import { accounts, sessions, users, verificationTokens } from '@kyujin/db/schema';
import authConfig from './auth.config';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        return token;
      }
      // Verify the user still exists. The DB can be reset in dev (and a user
      // can be deleted in prod), leaving JWT cookies that reference a missing
      // row. Returning null invalidates the session so the next request is
      // bounced to /login, where a fresh user row is created cleanly.
      if (token.id) {
        const [row] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, token.id))
          .limit(1);
        if (!row) return null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) session.user.id = token.id;
      return session;
    },
  },
});
