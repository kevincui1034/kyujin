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

// ── Auth.js v5 core tables ────────────────────────────────────────────────

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

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
    manualOverride: text('manual_override'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('applications_user_status_idx').on(t.userId, t.status),
    uniqueIndex('applications_user_company_role_unique').on(t.userId, t.company, t.role),
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
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('email_user_msg_unique').on(t.userId, t.gmailMessageId),
    index('email_thread_idx').on(t.gmailThreadId),
    index('email_received_idx').on(t.userId, t.receivedAt),
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

export type User = typeof users.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type EmailMessage = typeof emailMessages.$inferSelect;
export type NewEmailMessage = typeof emailMessages.$inferInsert;
export type Classification = typeof classifications.$inferSelect;
export type NewClassification = typeof classifications.$inferInsert;
export type GmailConnection = typeof gmailConnections.$inferSelect;
export type ApplicationStatus = (typeof applicationStatus.enumValues)[number];
export type ClassificationMethod = (typeof classificationMethod.enumValues)[number];

// Suppress unused warning — `sql` is re-exported for migrations that need raw fragments.
export { sql };
