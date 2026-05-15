import NextAuth from 'next-auth';
import authConfig from './auth.config';

// Edge-safe middleware: uses the slim auth.config.ts (no DB adapter, JWT-only),
// so it can run on the default Edge runtime under Turbopack. Session validation
// in route handlers / server components still goes through the full ./auth.ts
// with the Drizzle adapter on Node.
export const { auth: middleware } = NextAuth(authConfig);

// Routes excluded from middleware do their own auth in the handler:
// - `/api/applications` and `/api/stats` accept Bearer tokens (iOS) in addition
//   to cookies, so they can't go through the cookie-only middleware redirect.
// - `/api/gmail/pubsub` is called by Google Pub/Sub with no session cookie; it
//   auths via a shared token query param. Including it here put it in an
//   infinite 307 → /login redirect loop with Pub/Sub.
// - `/api/gmail/callback` is the OAuth return URL from Google; it auths via
//   the signed state nonce, not a session cookie.
export const config = {
  matcher: [
    '/app/:path*',
    '/api/gmail/backfill',
    '/api/gmail/connect',
    '/api/gmail/disconnect',
    '/api/gmail/watch',
  ],
};
