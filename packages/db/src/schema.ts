import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  integer,
  primaryKey,
  uuid,
  pgEnum,
  jsonb,
  uniqueIndex,
  index,
  real,
  bigint,
  boolean,
} from 'drizzle-orm/pg-core';

export const applicationStatus = pgEnum('application_status', [
  'applied',
  'no_response',
  'interview',
  'rejected',
  'accepted',
  'obtained',
]);

export const classificationMethod = pgEnum('classification_method', [
  'filter',
  'regex',
  'cache',
  'llm',
  'manual',
]);

export const queueState = pgEnum('queue_state', ['pending', 'processing', 'done', 'failed']);

export const senderRuleType = pgEnum('sender_rule_type', ['allow', 'block']);

// ── Auth.js v5 core tables ────────────────────────────────────────────────

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  plan: text('plan').notNull().default('free'),
  applicationGoal: integer('application_goal').notNull().default(50),
  dashboardView: text('dashboard_view').notNull().default('flow'),
  defaultAppSort: text('default_app_sort').notNull().default('lastEvent'),
  defaultAppRange: text('default_app_range').notNull().default('all'),
  defaultAppDir: text('default_app_dir').notNull().default('desc'),
  hideStatuses: text('hide_statuses')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  // Timestamp of the most recent /api/gmail/backfill request. Enforces a
  // 5-hour cool-down between manual backfills so a user can't reconnect-and-
  // re-trigger the LLM classifier to burn paid credits.
  lastBackfillAt: timestamp('last_backfill_at', { mode: 'date' }),
  // ── Stripe billing ──────────────────────────────────────────────────────
  // One Stripe Customer per user, created lazily on first checkout. Keyed
  // here so we can look the user up by customer in the webhook without
  // round-tripping through Stripe metadata.
  stripeCustomerId: text('stripe_customer_id'),
  // Mirror of the user's current (or most recent) subscription. The
  // application source of truth for "what plan does this user have" is
  // `plan`; these fields are how the UI surfaces renewal/cancel state and
  // how the webhook decides what to write to `plan`.
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripeSubscriptionStatus: text('stripe_subscription_status'),
  stripePriceId: text('stripe_price_id'),
  stripeCurrentPeriodEnd: timestamp('stripe_current_period_end', { mode: 'date' }),
  // True when the user has scheduled their subscription to end at the
  // period boundary. Distinct from `stripeSubscriptionStatus === 'canceled'`,
  // which only fires after the end-of-period sweep.
  stripeCancelAtPeriodEnd: boolean('stripe_cancel_at_period_end').notNull().default(false),
  // ── Apple App Store billing ─────────────────────────────────────────────
  // StoreKit's stable identity for a subscription. Survives renewals,
  // upgrades, and downgrades within the same subscription group, which is
  // why it (and not transactionId) is the key we use to map Apple state to
  // a user. Set on first /api/billing/apple/verify; the App Store Server
  // Notifications V2 webhook references it on every subsequent event.
  appleOriginalTransactionId: text('apple_original_transaction_id'),
  // The current SKU. Read by the entitlement derivation to look up which
  // plan (standard/premium) and cadence (monthly/annual) the user is on.
  appleProductId: text('apple_product_id'),
  // Mirror of Apple's subscription status (active / expired / in_grace_period
  // / in_billing_retry / revoked). Distinct from "is the user entitled" —
  // grace period and billing retry still entitle; expired and revoked don't.
  appleSubscriptionStatus: text('apple_subscription_status'),
  appleExpiresAt: timestamp('apple_expires_at', { mode: 'date' }),
  // Mirror of the StoreKit auto-renew preference. False here is the Apple
  // equivalent of stripe_cancel_at_period_end = true: the sub keeps running
  // until appleExpiresAt and then lapses unless the user re-enables it in
  // App Store Settings.
  appleAutoRenewEnabled: boolean('apple_auto_renew_enabled').notNull().default(false),
  // 'Sandbox' or 'Production'. We treat sandbox subscriptions as entitling
  // in non-prod environments and as ignored in production so a TestFlight
  // sandbox sub can't unlock a real prod account.
  appleEnvironment: text('apple_environment'),
  // True while the latest Apple transaction is an Introductory Offer (the
  // App Store's free-trial mechanism). Cleared on the next renewal. Lets
  // the entitlement derivation surface a `trialing` flag for iOS users in
  // the same way Stripe's 'trialing' status does on the web side.
  appleInIntroOffer: boolean('apple_in_intro_offer').notNull().default(false),
  // ── Cross-platform trial bookkeeping ────────────────────────────────────
  // Set the first time we see the user enter an entitling trial (Stripe
  // 'trialing' status, or Apple OFFER_REDEEMED with subscriptionOfferType
  // 'introductory'). Read by the checkout route to decide whether to attach
  // trial_period_days on Stripe's side. Apple enforces its own one-trial-
  // per-subscription-group rule independently; this column just keeps the
  // two platforms in sync so a user can't trial on web → cancel → trial on
  // iOS → cancel → trial on web again.
  trialUsedAt: timestamp('trial_used_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('users_stripe_customer_id_unique').on(t.stripeCustomerId),
  uniqueIndex('users_apple_original_transaction_id_unique').on(t.appleOriginalTransactionId),
]);

export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ── Gmail integration ─────────────────────────────────────────────────────

export const gmailConnections = pgTable(
  'gmail_connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emailAddress: text('email_address').notNull(),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token').notNull(),
    expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
    scope: text('scope').notNull(),
    historyId: bigint('history_id', { mode: 'bigint' }),
    watchExpiration: timestamp('watch_expiration', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('gmail_user_email_unique').on(t.userId, t.emailAddress),
    index('gmail_email_idx').on(t.emailAddress),
  ],
);

// ── Domain tables ─────────────────────────────────────────────────────────

export const applications = pgTable(
  'applications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    company: text('company').notNull(),
    role: text('role'),
    sourceDomain: text('source_domain'),
    status: applicationStatus('status').notNull().default('applied'),
    firstSeenAt: timestamp('first_seen_at', { mode: 'date' }).notNull(),
    lastEventAt: timestamp('last_event_at', { mode: 'date' }).notNull(),
    ghostedAt: timestamp('ghosted_at', { mode: 'date' }),
    // Tier-0 normalized "(company, role)" identity key. Computed in JS at
    // insert time. Lets the DB enforce uniqueness on the normalized form
    // (case/whitespace/punctuation-insensitive) so concurrent crons can't
    // both insert the same job and split it into two rows.
    matchKey: text('match_key'),
    // ATS requisition/posting ID extracted from the email ("Ref: 96191",
    // "Job ID: R-12345"). Stored uppercase. Drives the strictest match tier:
    // same canonical company + same jobId is treated as the same application
    // even when role strings differ in their location/title suffix.
    jobId: text('job_id'),
    manualOverride: text('manual_override'),
    notes: text('notes'),
    // Free-form key/value bag for columns that arrived via CSV/XLSX import and
    // don't map to a Yume field (e.g. salary, location, recruiter). Surfaced
    // on the application detail page; not indexed in v1 (display-only).
    customFields: jsonb('custom_fields').$type<Record<string, string>>(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('applications_user_status_idx').on(t.userId, t.status),
    uniqueIndex('applications_user_company_role_unique').on(t.userId, t.company, t.role),
    uniqueIndex('applications_user_match_key_unique').on(t.userId, t.matchKey),
    index('applications_user_job_id_idx').on(t.userId, t.jobId),
    // Backs the dashboard's primary sort (`listApplications` ORDER BY
    // lastEventAt DESC), plus `getActiveThreads` and `getRecentEvents` which
    // both filter/sort on lastEventAt within a user.
    index('applications_user_last_event_idx').on(t.userId, t.lastEventAt.desc()),
    // Backs the insights page's date-range filters: `getStats` and
    // `getDailyActivity` both filter by `(userId, firstSeenAt >= since)`.
    index('applications_user_first_seen_idx').on(t.userId, t.firstSeenAt),
  ],
);

export const emailMessages = pgTable(
  'email_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    gmailMessageId: text('gmail_message_id').notNull(),
    gmailThreadId: text('gmail_thread_id').notNull(),
    fromAddress: text('from_address').notNull(),
    fromDomain: text('from_domain').notNull(),
    subject: text('subject').notNull(),
    snippet: text('snippet'),
    receivedAt: timestamp('received_at', { mode: 'date' }).notNull(),
    classifiedAt: timestamp('classified_at', { mode: 'date' }),
    applicationId: uuid('application_id').references(() => applications.id, {
      onDelete: 'set null',
    }),
    // Which Gmail inbox the message came from. Nullable for legacy rows that
    // pre-date multi-inbox tracking; the UI falls back to hiding the inbox
    // hint when null.
    connectionId: uuid('connection_id').references(() => gmailConnections.id, {
      onDelete: 'set null',
    }),
    // Manual display position within the parent application's timeline.
    // NULL = sort by receivedAt (default). Set when the user drags rows
    // around; the reorder endpoint stamps 0..N onto every visible email so
    // the relative order is fully expressed. New emails arriving later have
    // displayOrder NULL and sort to the end via NULLS LAST.
    displayOrder: integer('display_order'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('email_user_msg_unique').on(t.userId, t.gmailMessageId),
    index('email_thread_idx').on(t.gmailThreadId),
    index('email_received_idx').on(t.userId, t.receivedAt),
    index('email_app_order_idx').on(t.applicationId, t.displayOrder),
    // Backs `listEmailsForApplication` — the per-application timeline fetch
    // hit on every application detail page. The (userId, applicationId)
    // prefix scopes the join, and receivedAt lets the index serve the
    // ORDER BY without a separate sort.
    index('email_user_app_received_idx').on(t.userId, t.applicationId, t.receivedAt),
  ],
);

export const classifications = pgTable('classifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  emailMessageId: uuid('email_message_id')
    .notNull()
    .references(() => emailMessages.id, { onDelete: 'cascade' }),
  label: applicationStatus('label').notNull(),
  confidence: real('confidence'),
  method: classificationMethod('method').notNull(),
  model: text('model'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  company: text('company'),
  role: text('role'),
  jobId: text('job_id'),
  raw: jsonb('raw'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const templateCache = pgTable(
  'template_cache',
  {
    cacheKey: text('cache_key').primaryKey(),
    senderDomain: text('sender_domain').notNull(),
    subjectPattern: text('subject_pattern').notNull(),
    label: applicationStatus('label').notNull(),
    hits: integer('hits').notNull().default(1),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [index('template_domain_idx').on(t.senderDomain)],
);

export const backfillQueue = pgTable(
  'backfill_queue',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    gmailMessageId: text('gmail_message_id').notNull(),
    // Which Gmail inbox the message came from. Nullable for legacy rows that
    // pre-date multi-inbox; the worker falls back to trying each connection.
    connectionId: uuid('connection_id').references(() => gmailConnections.id, {
      onDelete: 'cascade',
    }),
    state: queueState('state').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    enqueuedAt: timestamp('enqueued_at', { mode: 'date' }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { mode: 'date' }),
  },
  (t) => [
    uniqueIndex('queue_user_msg_unique').on(t.userId, t.gmailMessageId),
    index('queue_state_idx').on(t.state, t.enqueuedAt),
  ],
);

// Audit log for reversible user actions (merge / move / detach). Payload
// carries enough state to undo the action: which emails moved, what their
// previous applicationId was, and (for merges) a snapshot of the deleted
// application row so it can be reconstructed. `reverted_at` is set when an
// undo runs so the same audit entry can't be undone twice.
export const applicationAudit = pgTable(
  'application_audit',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    payload: jsonb('payload').notNull(),
    revertedAt: timestamp('reverted_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [index('application_audit_user_idx').on(t.userId, t.createdAt)],
);

// Per-request log used to rate-limit the chat assistant. One row per
// /api/agent/chat call. Daily count is the only signal consumed; old rows
// are not deleted by the app and can be pruned by a periodic job if the
// table ever grows past comfortable.
export const chatUsage = pgTable(
  'chat_usage',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [index('chat_usage_user_created_idx').on(t.userId, t.createdAt)],
);

// One row per LLM classifier call (i.e. emails that actually hit
// generateObject — not pre-filter or regex short-circuits). Backs the
// monthly classifier cap that bounds widening-window backfill abuse on
// Premium. Rolling 30d count is the only signal consumed; old rows can be
// pruned by a periodic job once the table grows uncomfortable.
export const classifierUsage = pgTable(
  'classifier_usage',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [index('classifier_usage_user_created_idx').on(t.userId, t.createdAt)],
);

// One row per rate-limited request. The rate-limit helper counts rows where
// `(userId, key) AND createdAt >= now() - window`. Same pattern as
// `chat_usage` / `classifier_usage` so we don't take on a new dependency
// (Upstash/KV) for what's a small DB-backed counter. A cleanup cron deletes
// rows older than the longest window we use (7d budget).
export const rateLimitEvents = pgTable(
  'rate_limit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Free-form bucket name, e.g. `'applications:bulk'`, `'emails:move'`.
    // Defined by the caller; not enumerated here so adding a new limit
    // doesn't require a schema change.
    key: text('key').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    // Backs both the count query (filter on user+key+createdAt) and the
    // cleanup query (scan oldest-first by createdAt).
    index('rate_limit_user_key_created_idx').on(t.userId, t.key, t.createdAt),
    index('rate_limit_created_idx').on(t.createdAt),
  ],
);

// Per-user sender rules. Augment the built-in allow/blocklists. Users can
// add domains to either list; user rules win over the built-in defaults.
export const userSenderRules = pgTable(
  'user_sender_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    type: senderRuleType('type').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('user_sender_rules_user_domain_type_unique').on(t.userId, t.domain, t.type),
    index('user_sender_rules_user_idx').on(t.userId),
  ],
);

// ── Relations ─────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  gmailConnections: many(gmailConnections),
  applications: many(applications),
  emailMessages: many(emailMessages),
}));

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  user: one(users, { fields: [applications.userId], references: [users.id] }),
  emails: many(emailMessages),
}));

export const emailMessagesRelations = relations(emailMessages, ({ one, many }) => ({
  user: one(users, { fields: [emailMessages.userId], references: [users.id] }),
  application: one(applications, {
    fields: [emailMessages.applicationId],
    references: [applications.id],
  }),
  classifications: many(classifications),
}));

export const classificationsRelations = relations(classifications, ({ one }) => ({
  email: one(emailMessages, {
    fields: [classifications.emailMessageId],
    references: [emailMessages.id],
  }),
}));

// Inverse relations for child tables that `usersRelations` declares with
// `many()`. Drizzle Studio's relation graph won't render without both sides
// declared, even though queries work fine with just the `many()` side.
export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const gmailConnectionsRelations = relations(gmailConnections, ({ one }) => ({
  user: one(users, { fields: [gmailConnections.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type EmailMessage = typeof emailMessages.$inferSelect;
export type NewEmailMessage = typeof emailMessages.$inferInsert;
export type Classification = typeof classifications.$inferSelect;
export type NewClassification = typeof classifications.$inferInsert;
export type GmailConnection = typeof gmailConnections.$inferSelect;
export type UserSenderRule = typeof userSenderRules.$inferSelect;
export type NewUserSenderRule = typeof userSenderRules.$inferInsert;
export type SenderRuleType = (typeof senderRuleType.enumValues)[number];
export type ApplicationStatus = (typeof applicationStatus.enumValues)[number];
export type ClassificationMethod = (typeof classificationMethod.enumValues)[number];

// Suppress unused warning — `sql` is re-exported for migrations that need raw fragments.
export { sql };
