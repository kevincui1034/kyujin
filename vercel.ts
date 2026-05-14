import { type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'nextjs',
  buildCommand: 'pnpm turbo run build --filter=@kyujin/web',
  installCommand: 'pnpm install --frozen-lockfile',
  outputDirectory: 'apps/web/.next',
  ignoreCommand: 'git diff --quiet HEAD^ HEAD -- apps/web packages',
  crons: [
    { path: '/api/cron/process-batch', schedule: '*/5 * * * *' },
    { path: '/api/cron/refresh-watches', schedule: '0 */12 * * *' },
  ],
};
