'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload } from 'lucide-react';
// Import from the `/types` subpath, not the package root. The barrel
// re-exports `./gmail`, which transitively pulls googleapis →
// google-auth-library → node:child_process. Turbopack walks the barrel
// for any client-component import and breaks on the Node-only require.
// Subpath import sidesteps it because `types.ts` has no server-only deps.
import {
  APPLICATION_STATUSES,
  IMPORT_TARGET_FIELDS,
  type ApplicationStatus,
  type ImportColumnMapping,
  type ImportColumnTarget,
} from '@kyujin/shared/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Eyebrow } from '@/components/kyujin/eyebrow';
import { cn } from '@/lib/utils';

const TARGET_LABEL: Record<ImportColumnTarget, string> = {
  company: 'Company',
  role: 'Role',
  status: 'Status',
  sourceDomain: 'Source',
  jobId: 'Job ID',
  notes: 'Notes',
  firstSeenAt: 'Applied date',
  lastEventAt: 'Last update',
  custom: 'Custom field',
  skip: 'Skip',
};

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  no_response: 'No response',
  interview: 'Interview',
  rejected: 'Rejected',
  accepted: 'Offer',
  obtained: 'Accepted',
};

interface PreviewResponse {
  importToken: string;
  headers: string[];
  suggestedMapping: ImportColumnMapping;
  statusPreview: Record<string, { mappedTo: ApplicationStatus; count: number; matched: boolean }>;
  rowCount: number;
  sampleRows: Record<string, string>[];
  warnings: string[];
}

interface CommitResponse {
  inserted: number;
  merged: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

type Step = 'upload' | 'map' | 'preview' | 'done';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<ImportColumnMapping>({});
  const [statusOverrides, setStatusOverrides] = useState<Record<string, ApplicationStatus>>({});
  const [result, setResult] = useState<CommitResponse | null>(null);

  function reset() {
    setStep('upload');
    setFile(null);
    setBusy(false);
    setError(null);
    setPreview(null);
    setMapping({});
    setStatusOverrides({});
    setResult(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function submitFile() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/applications/import?phase=preview', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(errorMessage(res.status, data));
        return;
      }
      const p = data as PreviewResponse;
      setPreview(p);
      setMapping(p.suggestedMapping);
      setStep('map');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitCommit() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/applications/import?phase=commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          importToken: preview.importToken,
          mapping,
          statusOverrides,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(errorMessage(res.status, data));
        return;
      }
      setResult(data as CommitResponse);
      setStep('done');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'import failed');
    } finally {
      setBusy(false);
    }
  }

  const companyMapped = Object.values(mapping).includes('company');

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <Eyebrow color="var(--kyujin-pink-600)">IMPORT APPLICATIONS</Eyebrow>
          <DialogTitle>
            {step === 'upload' && 'Upload a CSV or XLSX file'}
            {step === 'map' && 'Match your columns'}
            {step === 'preview' && 'Preview and commit'}
            {step === 'done' && 'Done'}
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Export from Notion, Huntr, Simplify, or a spreadsheet. Up to 1,000 rows per import.'}
            {step === 'map' &&
              'We guessed where each column should go. Anything you keep as "Custom field" is preserved on the application detail page.'}
            {step === 'preview' &&
              'Confirm how foreign status values map to your Kyujin statuses, then import.'}
            {step === 'done' && 'Your file has been imported.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {step === 'upload' && (
          <UploadStep file={file} onFile={setFile} />
        )}

        {step === 'map' && preview && (
          <MapStep
            preview={preview}
            mapping={mapping}
            onMappingChange={setMapping}
          />
        )}

        {step === 'preview' && preview && (
          <PreviewStep
            preview={preview}
            mapping={mapping}
            statusOverrides={statusOverrides}
            onStatusOverridesChange={setStatusOverrides}
          />
        )}

        {step === 'done' && result && (
          <DoneStep result={result} />
        )}

        <DialogFooter>
          {step === 'upload' && (
            <Button onClick={submitFile} disabled={!file || busy} className="rounded-full">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Continue
            </Button>
          )}
          {step === 'map' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')} className="rounded-full">
                Back
              </Button>
              <Button
                onClick={() => setStep('preview')}
                disabled={!companyMapped}
                className="rounded-full"
                title={!companyMapped ? 'Map a column to Company before continuing' : undefined}
              >
                Continue
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('map')} className="rounded-full">
                Back
              </Button>
              <Button onClick={submitCommit} disabled={busy} className="rounded-full">
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Import {preview?.rowCount} rows
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={() => handleOpenChange(false)} className="rounded-full">
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function errorMessage(status: number, data: unknown): string {
  const code = isObj(data) && typeof data.error === 'string' ? data.error : `http_${status}`;
  switch (code) {
    case 'paid_plan_required':
      return 'A paid plan is required to import.';
    case 'file_required':
      return 'No file selected.';
    case 'file_too_large':
      return 'File is too large (5 MB max).';
    case 'too_many_rows':
      return `Too many rows. Maximum is ${isObj(data) ? data.max : 1000}.`;
    case 'no_rows':
      return "We couldn't find any rows in that file.";
    case 'invalid_token':
      return 'Upload expired. Please re-upload the file.';
    default:
      return `Import failed (${code}).`;
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function UploadStep({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <label
      htmlFor="import-file"
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-pillow border-2 border-dashed py-10 text-sm text-kyujin-ink-muted transition-colors',
        dragOver
          ? 'border-[var(--kyujin-pink-500)] bg-[#fff1f5]'
          : 'border-[var(--kyujin-line-soft)] hover:border-[var(--kyujin-pink-500)]',
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) onFile(dropped);
      }}
    >
      <Upload className="h-6 w-6" />
      {file ? (
        <>
          <div className="serif text-base text-kyujin-ink">{file.name}</div>
          <div className="text-xs">{Math.round(file.size / 1024)} KB · click to choose another</div>
        </>
      ) : (
        <>
          <div>Drop a CSV or XLSX file here, or click to browse</div>
          <div className="text-xs">5 MB max · up to 1,000 rows</div>
        </>
      )}
      <input
        id="import-file"
        type="file"
        accept=".csv,.xlsx,.xls,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

function MapStep({
  preview,
  mapping,
  onMappingChange,
}: {
  preview: PreviewResponse;
  mapping: ImportColumnMapping;
  onMappingChange: (m: ImportColumnMapping) => void;
}) {
  function setOne(header: string, target: ImportColumnTarget) {
    onMappingChange({ ...mapping, [header]: target });
  }
  // Targets already claimed by another header — these get disabled so we
  // don't let two CSV columns map to the same Kyujin field.
  const claimed = new Set<string>();
  for (const [h, t] of Object.entries(mapping)) {
    if (t === 'custom' || t === 'skip') continue;
    if (h && mapping[h] === t) claimed.add(t);
  }
  return (
    <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
      {preview.headers.map((h) => {
        const sample = preview.sampleRows
          .map((r) => r[h])
          .filter((v) => v && v.trim())
          .slice(0, 3)
          .join(' · ');
        const current = mapping[h] ?? 'custom';
        return (
          <div
            key={h}
            className="flex items-center gap-3 rounded-lg border border-[var(--kyujin-line-soft)] bg-kyujin-paper px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="serif truncate text-sm text-kyujin-ink">{h}</div>
              {sample && (
                <div className="truncate text-xs text-kyujin-ink-muted">e.g. {sample}</div>
              )}
            </div>
            <Select
              value={current}
              onValueChange={(v) => setOne(h, v as ImportColumnTarget)}
            >
              <SelectTrigger className="h-9 w-44 rounded-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(IMPORT_TARGET_FIELDS as readonly ImportColumnTarget[]).map((t) => (
                  <SelectItem
                    key={t}
                    value={t}
                    disabled={t !== current && claimed.has(t)}
                  >
                    {TARGET_LABEL[t]}
                  </SelectItem>
                ))}
                <SelectItem value="custom">{TARGET_LABEL.custom}</SelectItem>
                <SelectItem value="skip">{TARGET_LABEL.skip}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}

function PreviewStep({
  preview,
  mapping,
  statusOverrides,
  onStatusOverridesChange,
}: {
  preview: PreviewResponse;
  mapping: ImportColumnMapping;
  statusOverrides: Record<string, ApplicationStatus>;
  onStatusOverridesChange: (s: Record<string, ApplicationStatus>) => void;
}) {
  const customCount = Object.values(mapping).filter((t) => t === 'custom').length;
  const statusEntries = Object.entries(preview.statusPreview);
  const fallbackCount = statusEntries.filter(([, v]) => !v.matched).reduce((a, [, v]) => a + v.count, 0);
  function override(raw: string, value: ApplicationStatus) {
    onStatusOverridesChange({ ...statusOverrides, [raw]: value });
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-lg border border-[var(--kyujin-line-soft)] bg-kyujin-paper p-3">
          <div className="text-xs text-kyujin-ink-muted">Rows</div>
          <div className="serif text-2xl text-kyujin-ink">{preview.rowCount}</div>
        </div>
        <div className="rounded-lg border border-[var(--kyujin-line-soft)] bg-kyujin-paper p-3">
          <div className="text-xs text-kyujin-ink-muted">Custom fields</div>
          <div className="serif text-2xl text-kyujin-ink">{customCount}</div>
        </div>
        <div className="rounded-lg border border-[var(--kyujin-line-soft)] bg-kyujin-paper p-3">
          <div className="text-xs text-kyujin-ink-muted">Status fallback</div>
          <div className="serif text-2xl text-kyujin-ink">{fallbackCount}</div>
        </div>
      </div>

      {statusEntries.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-kyujin-ink-muted">Status mapping</div>
          {statusEntries.map(([raw, info]) => (
            <div
              key={raw}
              className="flex items-center gap-3 rounded-lg border border-[var(--kyujin-line-soft)] bg-kyujin-paper px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="serif text-sm text-kyujin-ink">
                  {raw}
                  {!info.matched && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-700">
                      fallback
                    </span>
                  )}
                </div>
                <div className="text-xs text-kyujin-ink-muted">{info.count} rows</div>
              </div>
              <Select
                value={statusOverrides[raw] ?? info.mappedTo}
                onValueChange={(v) => override(raw, v as ApplicationStatus)}
              >
                <SelectTrigger className="h-9 w-36 rounded-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPLICATION_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-kyujin-ink-muted">
          No status column mapped — every row will be imported as <strong>Applied</strong>.
        </div>
      )}

      {preview.warnings.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {preview.warnings.join(' · ')}
        </div>
      )}
    </div>
  );
}

function DoneStep({ result }: { result: CommitResponse }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-lg border border-[var(--kyujin-line-soft)] bg-kyujin-paper p-3">
          <div className="text-xs text-kyujin-ink-muted">Created</div>
          <div className="serif text-2xl text-kyujin-ink">{result.inserted}</div>
        </div>
        <div className="rounded-lg border border-[var(--kyujin-line-soft)] bg-kyujin-paper p-3">
          <div className="text-xs text-kyujin-ink-muted">Merged</div>
          <div className="serif text-2xl text-kyujin-ink">{result.merged}</div>
        </div>
        <div className="rounded-lg border border-[var(--kyujin-line-soft)] bg-kyujin-paper p-3">
          <div className="text-xs text-kyujin-ink-muted">Skipped</div>
          <div className="serif text-2xl text-kyujin-ink">{result.skipped}</div>
        </div>
      </div>
      {result.errors.length > 0 && (
        <div className="max-h-32 overflow-y-auto rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <div className="mb-1 font-semibold">Skipped rows:</div>
          {result.errors.slice(0, 20).map((e, i) => (
            <div key={i}>
              Row {e.row}: {e.reason}
            </div>
          ))}
          {result.errors.length > 20 && (
            <div>…and {result.errors.length - 20} more</div>
          )}
        </div>
      )}
    </div>
  );
}
