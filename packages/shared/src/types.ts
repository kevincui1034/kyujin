import { z } from 'zod';

export const APPLICATION_STATUSES = [
  'applied',
  'no_response',
  'interview',
  'rejected',
  'accepted',
  'obtained',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const classifierLabel = z.enum([...APPLICATION_STATUSES, 'ignore']);
export type ClassifierLabel = z.infer<typeof classifierLabel>;

export interface NormalizedEmail {
  gmailMessageId: string;
  gmailThreadId: string;
  fromAddress: string;
  fromDomain: string;
  fromName: string | null;
  subject: string;
  snippet: string;
  body: string;
  receivedAt: Date;
}

export interface ClassificationResult {
  label: ClassifierLabel;
  confidence: number;
  method: 'filter' | 'regex' | 'cache' | 'llm' | 'manual';
  model?: string;
  company?: string | null;
  role?: string | null;
  jobId?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  raw?: unknown;
}

// ── CSV/XLSX import ───────────────────────────────────────────────────────

export const IMPORT_TARGET_FIELDS = [
  'company',
  'role',
  'status',
  'sourceDomain',
  'jobId',
  'notes',
  'firstSeenAt',
  'lastEventAt',
] as const;
export type ImportTargetField = (typeof IMPORT_TARGET_FIELDS)[number];

// 'custom' → goes into customFields jsonb under the original CSV header.
// 'skip'   → dropped on import.
export type ImportColumnTarget = ImportTargetField | 'custom' | 'skip';

export interface ImportColumnMapping {
  [csvHeader: string]: ImportColumnTarget;
}
