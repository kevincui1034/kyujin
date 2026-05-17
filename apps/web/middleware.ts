import NextAuth from 'next-auth';
import authConfig from './auth.config';

// Edge-safe middleware: uses the slim auth.config.ts (no DB adapter, JWT-only),
// so it can run on the default Edge runtime under Turbopack. Session validation
// in route handlers / server components still goes through the full ./auth.ts
// with the Drizzle adapter on Node.

// CORS posture (intentional — do not loosen without a clear reason):
//   - We set NO `Access-Control-Allow-Origin` headers anywhere. Browsers
//     enforce same-origin on `fetch` from any web app that isn't yumeai.app
//     itself, which is exactly what we want.
//   - The iOS app calls /api/applications, /api/stats, /api/billing/apple/*
//     from URLSession with no Origin header, so CORS doesn't apply to it.
//   - Stripe and Apple webhooks are server-to-server, also no CORS.
//   - If a future contributor wants to expose a public-facing API to other
//     web apps, do it with an explicit per-route allowlist of Origins, NOT
//     with `*` and NOT with credentials. Don't add it here without that
//     conversation first.
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
