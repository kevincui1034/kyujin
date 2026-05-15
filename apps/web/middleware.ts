import NextAuth from 'next-auth';
import authConfig from './auth.config';

// Edge-safe middleware: uses the slim auth.config.ts (no DB adapter, JWT-only),
// so it can run on the default Edge runtime under Turbopack. Session validation
// in route handlers / server components still goes through the full ./auth.ts
// with the Drizzle adapter on Node.
export const { auth: middleware } = NextAuth(authConfig);

// Routes excluded from middleware do their own auth in the handler — e.g.
// `/api/applications` and `/api/stats` accept Bearer tokens (iOS) in addition
// to cookies, so they can't go through the cookie-only middleware redirect.
export const config = {
  matcher: ['/app/:path*', '/api/gmail/:path*'],
};
