# Kyujin iOS

Native SwiftUI client for Kyujin. Talks to the Next.js backend in `apps/web` over JSON.

## Requirements

- macOS with **Xcode 15.4+** (iOS 17 deployment target)
- **xcodegen** to generate the `.xcodeproj` from `project.yml`:
  ```bash
  brew install xcodegen
  ```
- An Apple Developer account (free tier is fine for device testing; paid required for TestFlight + APNs)

## First run

```bash
cd apps/ios
xcodegen                 # generates Kyujin.xcodeproj
open Kyujin.xcodeproj
```

Then in Xcode:
1. Select the **Kyujin** target → Signing & Capabilities → set your **Team** (free Personal Team works for Simulator/device testing).
2. Pick the **iPhone 15 Pro** simulator (or your device) and press ⌘R.

The Simulator can talk to `http://localhost:3000` on the host Mac directly — no extra config needed.

### Running on a physical device

Localhost isn't reachable from a phone. Two options:

- **Cloudflare Tunnel** (recommended, free):
  ```bash
  brew install cloudflared
  cloudflared tunnel --url http://localhost:3000
  ```
  Copy the `https://*.trycloudflare.com` URL → set it in `Kyujin/Info.plist` under `KyujinAPIBaseURL`, or override via the Xcode scheme's environment variable `KYUJIN_API_BASE_URL`.

- **ngrok**: `ngrok http 3000`, same idea.

You'll also need to add the tunnel URL to your Google OAuth redirect URIs in GCP (both the login and Gmail clients) — Google rejects unknown redirect URIs.

## Architecture

```
KyujinApp.swift             @main entry
Models/
  Application.swift         Wire types (matches /api/applications)
Services/
  APIClient.swift           URLSession + JSON + Bearer auth
  AuthManager.swift         Sign in with Apple → backend exchange
  KeychainHelper.swift      Session token + email in Keychain
Views/
  RootView.swift            Auth state gate
  LoginView.swift           Sign in with Apple button
  ApplicationsView.swift    List + pull-to-refresh
  ApplicationDetailView.swift
  InsightsView.swift        Swift Charts funnel + KPIs
  SettingsView.swift        Gmail connect (SFSafariViewController)
  StatusBadge.swift         Shared status pill
```

## TODOs (backend-coupled)

These are NOT yet implemented in the web app — the iOS client compiles but will fail at the first API call until they're built:

1. **`POST /api/auth/ios-apple`** — exchanges an Apple ID token for an opaque session token stored in `sessions` table. Verifies the JWT against Apple's JWKS, creates/looks up the user, mints a session token that lives forever (or 90 days) and is accepted by future requests.
2. **Bearer-token auth on protected routes** — currently the web app uses Auth.js cookie sessions. Need a middleware variant that also accepts `Authorization: Bearer <sessionToken>` and looks up the session in the DB.
3. **`GET /api/applications`** — JSON list endpoint mirroring [apps/web/lib/data.ts:listApplications](../web/lib/data.ts).
4. **`GET /api/stats`** — JSON endpoint mirroring `getStats`.
5. **Gmail connect via SFSafariViewController** — the iOS sheet opens `/api/gmail/connect?token=...` which must pin a temporary cookie session from the bearer token, then redirect to Google. Or rebuild the Gmail OAuth flow natively in Swift via `ASWebAuthenticationSession`.
6. **Push notifications** — APNs key in Apple Developer portal, device-token registration endpoint, send-on-classification logic in the cron worker.

The iOS code is structured assuming these endpoints exist. When you add them in `apps/web`, the iOS app will start working.
