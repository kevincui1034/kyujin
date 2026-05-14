import { type NextRequest } from 'next/server';

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. In production this
// is automatically injected; in dev we accept the same header so we can curl
// the endpoints by hand.
export function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}
