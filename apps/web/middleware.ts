export { auth as middleware } from './auth';

// Routes excluded from middleware do their own auth in the handler — e.g.
// `/api/applications` and `/api/stats` accept Bearer tokens (iOS) in addition
// to cookies, so they can't go through the cookie-only middleware redirect.
export const config = {
  matcher: ['/app/:path*', '/api/gmail/:path*'],
};
