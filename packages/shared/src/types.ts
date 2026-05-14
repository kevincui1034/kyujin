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
  promptTokens?: number;
  completionTokens?: number;
  raw?: unknown;
}
