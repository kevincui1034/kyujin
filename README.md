# Kyujin

Email-based job application tracker. Connect Gmail, get a dashboard of every application you've sent, its current status (applied / interview / rejected / offer), and insights into your job hunt.

See [PLANNING.md](./PLANNING.md) for the full product brief.

---

## Monorepo layout

```
apps/
  web/        Next.js 15 (App Router) — dashboard, auth, Gmail OAuth, cron
  ios/        Native SwiftUI iOS app (no Expo, no React Native)
packages/
  db/         Drizzle ORM schema + Postgres client
  shared/     Gmail client, classifier, prompts, types (web only)
```

## Stack

| Concern | Choice |
|---|---|
| Web framework | Next.js 15 (App Router, RSC) |
| Web auth | Auth.js v5 (Google + optional Apple) |
| Database | Postgres (Supabase / Neon) + Drizzle ORM |
| Gmail | `googleapis` SDK, separate OAuth grant for `gmail.readonly` |
| Classification | Hybrid: sender allowlist → subject regex → template cache → AI Gateway (Gemini Flash-Lite) |
| Ingestion | Vercel Cron (every 5 min, 50-message batches) + Gmail Pub/Sub watch |
| Web UI | shadcn/ui + Tailwind + recharts |
| iOS | SwiftUI, iOS 17+, Sign in with Apple, Swift Charts, scaffolded via xcodegen |
| iOS ↔ backend | JSON API + Bearer tokens (Apple ID token exchange — backend TODO) |

## Local setup

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
# Fill in DATABASE_URL, AUTH_GOOGLE_ID/SECRET, AUTH_SECRET, GMAIL_*, AI_GATEWAY_API_KEY, CRON_SECRET
pnpm db:push                # apply Drizzle schema
pnpm dev                    # starts apps/web on http://localhost:3000
```

### Required environment variables

See [apps/web/.env.example](./apps/web/.env.example) for the full list.

- `AUTH_SECRET` — Auth.js cookie/JWT secret. `openssl rand -base64 32`.
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — OAuth credentials for **login**. Configure at https://console.cloud.google.com → APIs & Services → Credentials.
- `AUTH_APPLE_ID` / `AUTH_APPLE_SECRET` — optional. Apple sign-in is auto-disabled if blank.
- `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` — second OAuth client for the **Gmail readonly grant**. Can be the same project as the login client, but a separate OAuth client is cleaner.
- `GMAIL_REDIRECT_URI` — must match what you registered in GCP. Locally: `http://localhost:3000/api/gmail/callback`.
- `GMAIL_PUBSUB_TOPIC` — full topic name, e.g. `projects/my-gcp/topics/kyujin-gmail`. Only needed for incremental push notifications; backfill works without it.
- `AI_GATEWAY_API_KEY` — Vercel AI Gateway key. Get one from https://vercel.com/dashboard/ai-gateway.
- `DATABASE_URL` — Postgres connection string. Recommended: Neon via Vercel Marketplace, which auto-injects this.
- `CRON_SECRET` — bearer token Vercel Cron sends. `openssl rand -base64 32`.

### Google API scopes

- Login OAuth client uses `openid email profile` — unrestricted.
- Gmail OAuth client uses `gmail.readonly` — **restricted scope**. During dev, add test users in GCP. **Before going public, you must complete Google's CASA security assessment** (annual, $$$).

## Verification (manual)

1. `pnpm dev`, open `http://localhost:3000`, click "Get started" → sign in with Google.
2. Land on `/app`. Click "Connect Gmail" — separate OAuth grant for `gmail.readonly`.
3. Settings → "Run 90-day backfill" enqueues your message IDs.
4. Trigger the worker locally:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/process-batch
   ```
5. Reload `/app` to see classified applications. `/app/insights` for charts.

## Deploy

```bash
vercel link                # link apps/web
vercel env add              # set all env vars from .env.example
vercel deploy               # preview
vercel deploy --prod        # after sanity checking
```

Crons are configured in [vercel.ts](./vercel.ts) and provisioned automatically on first deploy.

## iOS app

See [apps/ios/README.md](./apps/ios/README.md) for the full setup. Quick start:

```bash
brew install xcodegen
pnpm ios:open                # generates Kyujin.xcodeproj and opens Xcode
```

The iOS app uses Sign in with Apple natively and talks to the web backend over JSON.
**The backend endpoints it needs (`/api/auth/ios-apple`, `/api/applications`, `/api/stats`, Bearer-token auth) are not yet implemented** — see `apps/ios/README.md` TODOs section.

## Out of scope for v0

- Outlook / Microsoft Graph
- Android (intentionally — iOS-only)
- Google CASA verification (required only before opening to public users)
- Pricing/billing

See PLANNING.md for the post-MVP roadmap.
