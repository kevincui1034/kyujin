# Kyujin – Job Application Tracker Planning

A planning document for an email-based job application tracker with web + iOS clients.

---

## Concept

An application tracker that reads the user's email inbox, automatically detects job application confirmations, interview requests, rejections, and offers, and surfaces them in a dashboard with visualizations, filtering, and push notifications.

**Status states tracked:**
- Applied
- No response
- Interview
- Rejected
- Accepted
- Job obtained

---

## Feasibility

Very buildable as a solo project. Gmail and Outlook both have well-documented APIs with push notifications, and modern LLMs handle email classification reliably. The hard part isn't reading email — it's the long tail of weird formats (ATS auto-replies, recruiter follow-ups, "we'll be in touch" templates that aren't actually rejections).

---

## Existing competitors

- **Simplify.jobs** — free Chrome extension that auto-tracks applications; reads Gmail. The closest competitor.
- **Huntr** — paid (~$5–10/mo), Gmail integration that parses application emails
- **Teal** — freemium, similar email parsing
- **JobTrack.app, Careerflow** — smaller players

The honest business challenge: Simplify is free and well-funded. Differentiation must be real. Strongest angles:

1. **Native iOS app with push notifications** — Simplify is web/extension; on-the-go notifications are a genuine gap
2. **Privacy positioning** — "your email stays on our servers, not sold to recruiters"
3. **Better analytics** — most trackers are CRUD-on-a-table; charts and insights are differentiators

---

## MVP scope and timeline

1. **Web app first** (Next.js) with Gmail OAuth + classification + dashboard — 2–3 weeks
2. Get 20 friends / r/jobs users on it, see if classification holds up across real inboxes
3. **Then** build native SwiftUI iOS client (no Expo, no Android) — 4–6 more weeks
4. **Then** push notifications via APNs and polish — 2 weeks

**Total:** ~2.5 months part-time to something shippable to TestFlight.

**Stack decision:** Mobile is native Swift/SwiftUI, not Expo/React Native. Trade-off accepted: no Android, must duplicate type definitions and API client in Swift, in exchange for native iOS feel and direct access to Sign in with Apple, Live Activities, Widgets, and Lock Screen integration.

---

## Features (MVP)

- Gmail OAuth connect flow
- Background email ingestion + classification
- Application list with status (Applied / No Response / Interview / Rejected / Accepted / Job Obtained)
- Filtering by status, company, date range, source
- Visualizations:
  - Response rate (any_response / total_applied)
  - Time-to-rejection histogram
  - Ghost rate (applied >30 days ago, no response)
  - Funnel chart (applied → interview → offer)
- Push notifications on status changes
- Manual override / edit row

## Features (post-MVP, ideas)

- Outlook support (Microsoft Graph API)
- Resume vs. recent rejections "gap analysis" framing
- Weekly summary email
- Export to CSV
- Tagging / notes per application
- Calendar integration for interview dates

---

## Open questions

- Privacy story: where exactly do email contents live, and for how long? Important for trust and for App Store privacy nutrition labels.
- Gmail API verification: scoped apps reading user mail need Google's restricted-scope verification (annual security assessment, can cost $$$). Worth confirming before going public.
- Outlook market share among job seekers — worth supporting at launch or v1.1?
