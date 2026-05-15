import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Apple from 'next-auth/providers/apple';

const hasApple = Boolean(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET);

// Edge-safe Auth.js config. No DB adapter, no Node-only imports — this is what
// middleware.ts loads. The full config in ./auth.ts spreads this and adds the
// DrizzleAdapter for use in route handlers and server components.
export default {
  session: { strategy: 'jwt' },
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
    authorized({ auth: session, request }) {
      const protectedPaths = ['/app', '/api/gmail', '/api/applications'];
      const isProtected = protectedPaths.some((p) => request.nextUrl.pathname.startsWith(p));
      if (!isProtected) return true;
      return !!session?.user;
    },
  },
} satisfies NextAuthConfig;
