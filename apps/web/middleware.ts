export { auth as middleware } from './auth';

export const config = {
  matcher: ['/app/:path*', '/api/gmail/:path*', '/api/applications/:path*'],
};
