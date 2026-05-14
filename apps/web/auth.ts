import NextAuth, { type DefaultSession } from 'next-auth';
import Google from 'next-auth/providers/google';
import Apple from 'next-auth/providers/apple';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@kyujin/db/client';
import { accounts, sessions, users, verificationTokens } from '@kyujin/db/schema';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}

const hasApple = Boolean(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET);

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'database' },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Login-only scopes. Gmail readonly is requested via a separate flow
      // (apps/web/app/api/gmail/connect) so Apple users can also connect Gmail.
      authorization: { params: { scope: 'openid email profile' } },
    }),
    ...(hasApple
      ? [
          Apple({
            clientId: process.env.AUTH_APPLE_ID,
            clientSecret: process.env.AUTH_APPLE_SECRET,
          }),
        ]
      : []),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
    authorized({ auth: session, request }) {
      const protectedPaths = ['/app', '/api/gmail', '/api/applications'];
      const isProtected = protectedPaths.some((p) => request.nextUrl.pathname.startsWith(p));
      if (!isProtected) return true;
      return !!session?.user;
    },
  },
});
