import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  APPLICATION_STATUSES,
  IMPORT_TARGET_FIELDS,
  type ApplicationStatus,
  type ImportColumnMapping,
  type ImportColumnTarget,
  type ImportTargetField,
} from './types';

// Header text → target field. Lower-case, trimmed, alphanumerics only so that
// "Job Title", "job_title", "JOB-TITLE" all match the same synonym.
const FIELD_SYNONYMS: Record<ImportTargetField, string[]> = {
  company: ['company', 'companyname', 'employer', 'organization', 'org'],
  role: ['role', 'position', 'title', 'jobtitle', 'job', 'roletitle'],
  status: ['status', 'stage', 'state', 'pipelinestage'],
  sourceDomain: ['source', 'sourcedomain', 'jobboard', 'platform', 'channel', 'via'],
  jobId: ['jobid', 'requisition', 'requisitionid', 'reqid', 'postingid', 'ref', 'referenceid'],
  notes: ['notes', 'comments', 'description', 'details'],
  firstSeenAt: [
    'applied',
    'appliedat',
    'dateapplied',
    'applicationdate',
    'firstseen',
    'firstseenat',
    'createdat',
    'datesubmitted',
  ],
  lastEventAt: ['updated', 'lastupdate', 'lastupdated', 'lastevent', 'lasteventat', 'modified', 'modifiedat'],
};

// Foreign status text → our 6-status enum. Lower-case + alnum-only on the
// LHS the same way headers are normalized.
const STATUS_SYNONYMS: Record<ApplicationStatus, string[]> = {
  applied: ['applied', 'submitted', 'new', 'wishlist', 'open'],
  no_response: ['noresponse', 'noreply', 'pending', 'waiting', 'inreview'],
  interview: [
    'interview',
    'interviewing',
    'phonescreen',
    'screen',
    'screening',
    'onsite',
    'final',
    'finalround',
    'recruitercall',
    'technical',
    'technicalinterview',
    'hr',
  ],
  rejected: [
    'rejected',
    'reject',
    'declined',
    'withdrawn',
    'closed',
    'notselected',
    'nooffer',
    'ghosted',
    'denied',
  ],
  accepted: ['accepted', 'offer', 'offered', 'offerextended', 'offerreceived'],
  obtained: ['obtained', 'acceptedoffer', 'hired', 'signed', 'joined', 'startdate'],
};

function alnumLower(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const REVERSE_FIELD_LOOKUP: Map<string, ImportTargetField> = (() => {
  const m = new Map<string, ImportTargetField>();
  for (const [field, syns] of Object.entries(FIELD_SYNONYMS) as [ImportTargetField, string[]][]) {
    for (const s of syns) m.set(alnumLower(s), field);
  }
  return m;
})();

const REVERSE_STATUS_LOOKUP: Map<string, ApplicationStatus> = (() => {
  const m = new Map<string, ApplicationStatus>();
  for (const [status, syns] of Object.entries(STATUS_SYNONYMS) as [ApplicationStatus, string[]][]) {
    for (const s of syns) m.set(alnumLower(s), status);
    // Also map the canonical enum value to itself so re-imports of our own
    // exports round-trip without hitting the fallback.
    m.set(alnumLower(status), status);
  }
  return m;
})();

// Suggest a target for each CSV header based on the synonym table. Anything
// we don't recognize defaults to 'custom' so user-defined columns survive
// the import as structured key/value data inside customFields.
export function detectColumnMapping(headers: string[]): ImportColumnMapping {
  const mapping: ImportColumnMapping = {};
  const usedTargets = new Set<ImportTargetField>();
  for (const h of headers) {
    const hit = REVERSE_FIELD_LOOKUP.get(alnumLower(h));
    if (hit && !usedTargets.has(hit)) {
      mapping[h] = hit;
      usedTargets.add(hit);
    } else {
      mapping[h] = 'custom';
    }
  }
  return mapping;
}

export interface NormalizeStatusResult {
  value: ApplicationStatus;
  matched: boolean;
}

export function normalizeStatus(raw: string | null | undefined): NormalizeStatusResult {
  if (!raw) return { value: 'applied', matched: false };
  const key = alnumLower(raw);
  if (!key) return { value: 'applied', matched: false };
  const hit = REVERSE_STATUS_LOOKUP.get(key);
  if (hit) return { value: hit, matched: true };
  return { value: 'applied', matched: false };
}

export interface ParsedImportFile {
  headers: string[];
  rows: Record<string, string>[];
  warnings: string[];
}

const CSV_MIME = new Set(['text/csv', 'application/csv', 'text/plain']);
const XLSX_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

// Parse a CSV or XLSX file. Returns string-valued rows so downstream code
// can coerce per-target-field. Trims whitespace and drops fully-empty rows.
// Falls back to extension-sniffing when the browser sends a generic MIME.
export function parseImportFile(
  buffer: ArrayBuffer,
  mime: string,
  filename?: string,
): ParsedImportFile {
  const ext = filename?.toLowerCase().split('.').pop() ?? '';
  const isXlsx = XLSX_MIME.has(mime) || ext === 'xlsx' || ext === 'xls';
  const isCsv = CSV_MIME.has(mime) || ext === 'csv' || ext === 'tsv';
  if (isXlsx && !isCsv) return parseXlsx(buffer);
  if (isCsv) return parseCsv(buffer);
  // Last-ditch attempt: try CSV first (it'll surface an empty result if it's
  // really binary), but most browsers tag CSV correctly so this is rare.
  return parseCsv(buffer);
}

function parseCsv(buffer: ArrayBuffer): ParsedImportFile {
  const text = new TextDecoder('utf-8').decode(buffer);
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
    transform: (v) => (typeof v === 'string' ? v.trim() : v),
  });
  const headers = (result.meta.fields ?? []).filter((h) => h.length > 0);
  const rows = (result.data ?? []).filter((r) =>
    Object.values(r).some((v) => v != null && String(v).trim() !== ''),
  );
  const warnings = (result.errors ?? []).slice(0, 5).map((e) => `row ${e.row ?? '?'}: ${e.message}`);
  return { headers, rows: rows.map((r) => coerceRow(r, headers)), warnings };
}

function parseXlsx(buffer: ArrayBuffer): ParsedImportFile {
  const wb = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return { headers: [], rows: [], warnings: ['workbook has no sheets'] };
  const sheet = wb.Sheets[firstSheetName]!;
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
  if (aoa.length === 0) return { headers: [], rows: [], warnings: [] };
  const headerRow = (aoa[0] ?? []).map((v) => String(v ?? '').trim());
  const headers = headerRow.filter((h) => h.length > 0);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i] ?? [];
    const obj: Record<string, string> = {};
    let hasValue = false;
    for (let c = 0; c < headerRow.length; c++) {
      const key = headerRow[c];
      if (!key) continue;
      const raw = r[c];
      const s = raw == null ? '' : String(raw).trim();
      if (s !== '') hasValue = true;
      obj[key] = s;
    }
    if (hasValue) rows.push(obj);
  }
  const warnings = wb.SheetNames.length > 1
    ? [`Imported sheet "${firstSheetName}"; additional sheets ignored.`]
    : [];
  return { headers, rows, warnings };
}

function coerceRow(r: Record<string, unknown>, headers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers) {
    const v = r[h];
    out[h] = v == null ? '' : String(v).trim();
  }
  return out;
}

// Try to parse a date-like cell. Returns null on failure so the row can
// fall back to `now` rather than reject the whole import. Accepts ISO,
// `YYYY-MM-DD`, US `M/D/YYYY`, and Excel serial dates that arrive as
// pre-formatted strings (xlsx's raw:false already does this for us).
export function parseDateCell(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const ms = Date.parse(s);
  if (!Number.isNaN(ms)) return new Date(ms);
  // Common US format like 1/5/2025
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month - 1, day);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export interface MappedImportRow {
  company: string;
  role: string | null;
  status: ApplicationStatus;
  sourceDomain: string | null;
  jobId: string | null;
  notes: string | null;
  firstSeenAt: Date;
  lastEventAt: Date;
  customFields: Record<string, string> | null;
  // Distinct raw status string (pre-normalization), so the UI can show
  // "N rows used the fallback" and offer overrides.
  rawStatus: string | null;
}

// Apply a column mapping to a single parsed row. Pure function; no DB.
// `statusOverrides` lets the preview UI force a specific Kyujin status for a
// given raw cell value (keyed by the raw string, lower-cased + trimmed).
export function applyMapping(
  row: Record<string, string>,
  mapping: ImportColumnMapping,
  options: { now: Date; statusOverrides?: Record<string, ApplicationStatus> } = { now: new Date() },
): MappedImportRow | null {
  const now = options.now;
  const out: Partial<Record<ImportTargetField, string>> = {};
  const custom: Record<string, string> = {};
  for (const [header, target] of Object.entries(mapping)) {
    const value = (row[header] ?? '').trim();
    if (!value) continue;
    if (target === 'skip') continue;
    if (target === 'custom') {
      custom[header] = value;
      continue;
    }
    out[target] = value;
  }
  const company = out.company?.trim();
  if (!company) return null;

  const rawStatus = out.status ?? null;
  let status: ApplicationStatus;
  if (rawStatus) {
    const overrideKey = rawStatus.trim().toLowerCase();
    const override = options.statusOverrides?.[overrideKey];
    status = override ?? normalizeStatus(rawStatus).value;
  } else {
    status = 'applied';
  }

  const firstSeenAt = parseDateCell(out.firstSeenAt) ?? now;
  const lastEventAt = parseDateCell(out.lastEventAt) ?? firstSeenAt;

  return {
    company,
    role: out.role?.trim() || null,
    status,
    sourceDomain: out.sourceDomain?.trim().toLowerCase() || null,
    jobId: out.jobId?.trim().toUpperCase() || null,
    notes: out.notes?.trim() || null,
    firstSeenAt,
    lastEventAt: lastEventAt < firstSeenAt ? firstSeenAt : lastEventAt,
    customFields: Object.keys(custom).length > 0 ? custom : null,
    rawStatus,
  };
}

// Build the per-distinct-status preview the UI shows in step 3. Returns
// { rawValue → { mappedTo, count, matched } } so users can spot foreign
// statuses that fell back to 'applied' and override them before commit.
export interface StatusPreviewEntry {
  mappedTo: ApplicationStatus;
  count: number;
  matched: boolean;
}

export function buildStatusPreview(
  rows: Record<string, string>[],
  mapping: ImportColumnMapping,
): Record<string, StatusPreviewEntry> {
  const statusHeader = Object.entries(mapping).find(([, t]) => t === 'status')?.[0];
  if (!statusHeader) return {};
  const out: Record<string, StatusPreviewEntry> = {};
  for (const r of rows) {
    const raw = (r[statusHeader] ?? '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!out[key]) {
      const { value, matched } = normalizeStatus(raw);
      out[key] = { mappedTo: value, count: 0, matched };
    }
    out[key].count += 1;
  }
  return out;
}

// Validate a mapping submitted by the client. Returns the first error
// message, or null if the mapping is valid.
export function validateMapping(mapping: ImportColumnMapping): string | null {
  const targets = Object.values(mapping);
  if (!targets.includes('company')) return 'company column is required';
  // Reject duplicate target assignments for everything except custom/skip.
  const seen = new Set<string>();
  for (const t of targets) {
    if (t === 'custom' || t === 'skip') continue;
    if (seen.has(t)) return `duplicate mapping for "${t}"`;
    seen.add(t);
  }
  return null;
}

// Re-exported for convenience so callers don't have to import from two places.
export { APPLICATION_STATUSES, IMPORT_TARGET_FIELDS };
