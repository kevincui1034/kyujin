# Kyujin — Page & Screen Flow Export

> **Suggested prompt for claude.ai:**
> "Below is a route + screen inventory for Kyujin, a job application tracker (Next.js web + native SwiftUI iOS). Build a navigation flow diagram showing how a user moves between pages on each platform, where the two platforms diverge, and where the API surface fits in. Use Mermaid (`flowchart LR`) and produce one diagram for web, one for iOS, and one combined system map."

---

## Product summary

Kyujin connects a user's Gmail, automatically classifies job-application emails (applied / interview / rejected / accepted / obtained), and surfaces them in a dashboard with charts. Two clients share the same backend:

- **Web** — Next.js 15 App Router. Auth via Auth.js (Google + optional Apple). Gmail OAuth is a *separate* grant requested only after the user opts in.
- **iOS** — Native SwiftUI, iOS 17+. Sign in with Apple natively. Gmail connect opens the web OAuth flow inside an SFSafariViewController.

Ingestion runs server-side via Vercel Cron (every 5 min, 50-msg batches) and optional Gmail Pub/Sub push.

---

## Web — page inventory

Routes live under `apps/web/app/`. The App Router segment `(app)/` is the authenticated zone (its layout redirects unauthenticated users to `/login`).

### `/` — Landing page
- **File:** `app/page.tsx`
- **Purpose:** Marketing splash. One-line value prop + a single CTA.
- **State-dependent CTA:**
  - Signed out → "Get started" → `/login`
  - Signed in → "Open dashboard" → `/app`
- **Links out:** `/login`, `/app`

### `/login` — Sign-in
- **File:** `app/login/page.tsx`
- **Purpose:** Auth.js sign-in card with provider buttons.
- **Actions:** "Continue with Google" (always), "Continue with Apple" (only if `AUTH_APPLE_ID/SECRET` env vars are set).
- **On success:** redirects to `/app`.
- **Guard:** if already signed in, server-side redirect straight to `/app`.

### `/app` — Applications list (authenticated home)
- **File:** `app/app/page.tsx`
- **Purpose:** Primary dashboard — table of every detected job application with company, role, status, last event timestamp.
- **Filter pills:** All / applied / no_response / interview / rejected / accepted / obtained (driven by `?status=` query param).
- **Empty / unconnected states:**
  - No Gmail connection → "Connect Gmail to get started" card with button → `/api/gmail/connect`.
  - Gmail connected but no apps yet → "cron will populate this shortly" empty card.
- **Row click:** navigates to `/app/applications/[id]`.
- **Top nav (from `app/app/layout.tsx`):** Applications (`/app`) · Insights (`/app/insights`) · Settings (`/app/settings`) · user email · Sign out.

### `/app/applications/[id]` — Application detail
- **File:** `app/app/applications/[id]/page.tsx`
- **Purpose:** Single-application drill-down. Shows company, role, current status badge, and a Timeline card listing every email tied to this application (from address, subject, snippet, received-at).
- **Back link:** "← All applications" → `/app`.
- **404:** if the app id doesn't belong to the user or doesn't exist.

### `/app/insights` — Insights
- **File:** `app/app/insights/page.tsx`
- **Purpose:** Analytics view.
- **KPI cards:** Total applications · Response rate · Ghost rate (>30 days, no reply).
- **Charts:** Funnel (Applied → Interview → Offer) using recharts; Time-to-rejection histogram.
- **No outbound links besides the top nav.**

### `/app/settings` — Settings: Gmail tab (default)
- **Files:** `app/app/settings/layout.tsx` (renders `<SettingsTabs />` + child), `app/app/settings/page.tsx`, `app/app/settings/tabs.tsx`
- **Tabs (sub-nav):** **Gmail** (`/app/settings`) · **Rules** (`/app/settings/rules`).
- **Purpose of Gmail tab:** manage the Gmail OAuth connection.
- **State-dependent body:**
  - Not connected → "Connect Gmail" button → `/api/gmail/connect`.
  - Connected → email address shown, plus three controls: **Run backfill** (90-day default; 365-day option is premium-gated), **Start Pub/Sub watch**, **Disconnect**.
- **Toast banners:** success banner when `?gmail=connected`; error banner when `?gmail_error=...` (set by the OAuth callback).

### `/app/settings/rules` — Settings: Rules tab
- **File:** `app/app/settings/rules/page.tsx`
- **Purpose:** User-managed allow/block list of sender domains that override the built-in classifier.
- **UI:** Two editable lists (Allow / Block) with an inline `RulesEditor` client component that POSTs/DELETEs against `/api/user-rules`.
- **Copy:** "Allow forces a sender through to the LLM. Block silently ignores everything from that sender."

---

## Web — API surface

Not pages, but referenced by the UI flow. Path / method / purpose.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | Auth.js handler for Google/Apple sign-in. Triggered by `/login` provider buttons. |
| `/api/gmail/connect` | GET | Builds a signed-state Gmail OAuth URL and 302-redirects to Google's consent screen. If a connection already exists, redirects to `/app/settings?gmail=connected` instead. |
| `/api/gmail/callback` | GET | OAuth callback. Verifies HMAC state, exchanges code for tokens, upserts the `gmail_connections` row, redirects to `/app/settings?gmail=connected` (or `?gmail_error=...`). |
| `/api/gmail/disconnect` | POST | Deletes the user's `gmail_connections` row. Called from the Settings page Disconnect button. |
| `/api/gmail/backfill` | POST | Body: `{ days: 30 \| 90 \| 180 \| 365 }`. Lists job-like message IDs and enqueues them in `backfill_queue`. Returns 402 `premium_required` if days > free-plan max. |
| `/api/gmail/watch` | POST | Calls Gmail `users.watch` to subscribe the user to Pub/Sub notifications and stores `historyId` + `watchExpiration`. Requires `GMAIL_PUBSUB_TOPIC`. |
| `/api/gmail/pubsub` | POST | Pub/Sub push receiver. Diffs `historyId`, enqueues new message IDs into `backfill_queue`. Shared-secret query-param auth. |
| `/api/cron/process-batch` | GET/POST | Vercel Cron worker. Pulls up to 50 queued messages, fetches their content via Gmail API, classifies, upserts applications, revalidates cache tags. CRON_SECRET bearer auth. |
| `/api/cron/refresh-watches` | GET | Re-issues `users.watch` for any connection whose watch expires within 24h (Gmail watches expire after 7 days). CRON_SECRET bearer auth. |
| `/api/applications` | GET | iOS app data source. Returns the user's applications; optional `?status=`. Bearer-token auth (TODO: token issuance via `/api/auth/ios-apple` not yet implemented). |
| `/api/stats` | GET | iOS app data source. Returns the same aggregated stats the web Insights page uses. Bearer-token auth. |
| `/api/user-rules` | GET/POST/DELETE | CRUD for the sender allow/block list shown on `/app/settings/rules`. |

---

## iOS — screen inventory

Entry point: `KyujinApp.swift` → `RootView` → either `LoginView` or `MainTabView`. `MainTabView` is a 3-tab `TabView`, each tab wrapped in its own `NavigationStack`.

### `RootView` — Auth gate
- **File:** `Views/RootView.swift`
- **Purpose:** On launch, runs `auth.restore()` (Keychain lookup) and switches between Login and the tabbed main UI based on `auth.isAuthenticated`.

### `LoginView`
- **File:** `Views/LoginView.swift`
- **Purpose:** Wordmark + tagline + `SignInWithAppleButton`.
- **Action:** Apple sign-in → `auth.signInWithApple(result:)` → on success, `isAuthenticated` flips and `MainTabView` takes over.
- **Footer copy:** "Gmail access is requested separately, only after you choose to connect it."

### `MainTabView` — Tab container
- **File:** `Views/RootView.swift`
- **Tabs:** Applications (`tray.full`), Insights (`chart.bar`), Settings (`gear`).

### Tab 1 — `ApplicationsView`
- **File:** `Views/ApplicationsView.swift`
- **Purpose:** List of applications fetched from `/api/applications`.
- **State machine:** loading · empty · error · loaded.
  - Empty state copy: "Connect Gmail in Settings to start tracking."
  - Error: `ContentUnavailableView` with the error message.
- **Row tap:** `NavigationLink` → `ApplicationDetailView(application:)`.
- **Pull to refresh:** re-fetches.

### `ApplicationDetailView` (pushed from Applications tab)
- **File:** `Views/ApplicationDetailView.swift`
- **Purpose:** Read-only detail. Company headline, role subhead, status badge, "First seen" date, "Last event" date.
- **Note:** No email timeline yet on iOS (web has it; iOS is a thinner viewer).

### Tab 2 — `InsightsView`
- **File:** `Views/InsightsView.swift`
- **Purpose:** Mobile version of the Insights page, fed by `/api/stats`.
- **Layout:** 2x2 KPI grid (Total · Response rate · Interviews · Ghost rate), then a Funnel `GroupBox` rendered with Swift Charts (`BarMark`).
- **Pull to refresh:** re-fetches.

### Tab 3 — `SettingsView`
- **File:** `Views/SettingsView.swift`
- **Purpose:** `Form` with three sections.
  - **Gmail section:** "Connect Gmail" button presents a `.sheet` containing an `SFSafariViewController` pointed at `APIClient.shared.gmailConnectURL()` (the same web OAuth flow).
  - **Account section:** shows current email, "Sign out" destructive button.
  - **Bottom section:** app version from `Bundle.main`.

---

## Cross-platform flow notes

A few things worth knowing when drawing arrows:

1. **Gmail connection is web-owned.** Both clients funnel into `/api/gmail/connect` → Google consent → `/api/gmail/callback`. On iOS this happens inside a Safari sheet; after consent, the page lands on `/app/settings?gmail=connected` (still inside the sheet). The user dismisses the sheet manually.
2. **Ingestion is invisible to both clients.** Neither client triggers per-message processing. Email classification happens via `/api/cron/process-batch` every 5 minutes. The UI just polls the resulting tables.
3. **iOS auth is not fully wired.** The backend endpoint that would mint a Bearer token from a Sign-in-with-Apple identity token (`/api/auth/ios-apple`) doesn't exist yet — the iOS keychain stores a token, but the issuance path is a TODO. Mark this as a "missing edge" if you draw it.
4. **No web sign-up flow distinct from sign-in.** Auth.js creates the user row on first successful OAuth callback; there's no email/password form.
5. **Settings tabs only exist on web.** iOS Settings is a flat `Form`; the Rules editor is web-only.

---

## File map (for cross-referencing)

```
apps/web/app/
  page.tsx                              → /
  login/page.tsx                        → /login
  layout.tsx                            → root HTML shell
  app/
    layout.tsx                          → authenticated chrome + top nav
    page.tsx                            → /app
    applications/[id]/page.tsx          → /app/applications/[id]
    insights/page.tsx                   → /app/insights
    settings/
      layout.tsx                        → settings shell + tab nav
      tabs.tsx                          → tab links (Gmail | Rules)
      page.tsx                          → /app/settings
      rules/page.tsx                    → /app/settings/rules
  api/                                  → see API surface table above

apps/ios/Kyujin/
  KyujinApp.swift                       → @main
  Views/
    RootView.swift                      → auth gate + MainTabView
    LoginView.swift                     → Sign in with Apple
    ApplicationsView.swift              → Tab 1
    ApplicationDetailView.swift         → pushed detail
    InsightsView.swift                  → Tab 2
    SettingsView.swift                  → Tab 3
    StatusBadge.swift                   → shared component
```
