import Link from 'next/link';
import { ChevronDown, Search, X } from 'lucide-react';
import { auth } from '@/auth';
import {
  listApplications,
  countApplications,
  listInboxConnections,
  getUserProfile,
  type ApplicationsRangeKey,
  type ApplicationsSortDir,
  type ApplicationsSortKey,
} from '@/lib/data';
import { ExportButton } from './export-button';
import { ImportButton } from './import-button';
import { RowSourceEditor, RowStatusEditor } from './row-editors';
import { CompanyAvatar } from '@/components/yume/company-avatar';
import { Eyebrow } from '@/components/yume/eyebrow';
import { PillowCard } from '@/components/yume/pillow-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { cn, formatRelative } from '@/lib/utils';
import type { ApplicationSource, ApplicationStatus } from '@kyujin/shared';
import {
  APPLICATION_SOURCES,
  APPLICATION_SOURCE_LABELS,
  APPLICATION_STATUSES,
} from '@kyujin/shared';

interface SearchParams {
  status?: string;
  source?: string;
  range?: string;
  q?: string;
  sort?: string;
  dir?: string;
  page?: string;
  perPage?: string;
}

const PER_PAGE_OPTIONS = [10, 25, 50] as const;
type PerPage = (typeof PER_PAGE_OPTIONS)[number];
const DEFAULT_PER_PAGE: PerPage = 25;

function isPerPage(value: string | undefined): value is `${PerPage}` {
  return !!value && (PER_PAGE_OPTIONS as readonly number[]).includes(Number(value));
}

const RANGES: { key: ApplicationsRangeKey; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: '365d', label: 'Last year' },
];

function isStatus(value: string | undefined): value is ApplicationStatus {
  return !!value && (APPLICATION_STATUSES as readonly string[]).includes(value);
}

function isSource(value: string | undefined): value is ApplicationSource {
  return !!value && (APPLICATION_SOURCES as readonly string[]).includes(value);
}

function isRange(value: string | undefined): value is ApplicationsRangeKey {
  return !!value && RANGES.some((r) => r.key === value);
}

function isSort(value: string | undefined): value is ApplicationsSortKey {
  return value === 'lastEvent' || value === 'company' || value === 'source';
}

function isDir(value: string | undefined): value is ApplicationsSortDir {
  return value === 'asc' || value === 'desc';
}

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  no_response: 'No answer',
  interview: 'Interview',
  rejected: 'Rejected',
  accepted: 'Offer',
  obtained: 'Accepted',
};

function buildUrl(params: Record<string, string | undefined>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') usp.set(k, v);
  }
  const qs = usp.toString();
  return qs ? `/app/applications?${qs}` : '/app/applications';
}

export default async function ApplicationsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const params = await searchParams;
  // Load profile up front so we can fall back to user defaults when a given
  // search param is absent from the URL. URL params always win — shared links
  // remain stable for the recipient.
  const profile = await getUserProfile(userId);

  const defaultSort: ApplicationsSortKey =
    profile && isSort(profile.defaultAppSort) ? profile.defaultAppSort : 'lastEvent';
  const defaultDir: ApplicationsSortDir =
    profile && isDir(profile.defaultAppDir) ? profile.defaultAppDir : 'desc';
  const defaultRange: ApplicationsRangeKey =
    profile && isRange(profile.defaultAppRange) ? profile.defaultAppRange : 'all';
  const hideStatuses: ApplicationStatus[] = (profile?.hideStatuses ?? []).filter(
    (s): s is ApplicationStatus => (APPLICATION_STATUSES as readonly string[]).includes(s),
  );

  const status = isStatus(params.status) ? params.status : undefined;
  const source = isSource(params.source) ? params.source : undefined;
  const range: ApplicationsRangeKey = isRange(params.range) ? params.range : defaultRange;
  const q = params.q?.trim() ?? '';
  const sort: ApplicationsSortKey = isSort(params.sort) ? params.sort : defaultSort;
  const dir: ApplicationsSortDir = isDir(params.dir) ? params.dir : defaultDir;
  const perPage: PerPage = isPerPage(params.perPage)
    ? (Number(params.perPage) as PerPage)
    : DEFAULT_PER_PAGE;
  const requestedPage = Math.max(1, Number(params.page) || 1);
  // Only apply the hide-list when no explicit status filter is in the URL.
  const excludeStatuses = status ? undefined : hideStatuses;

  const [total, connections] = await Promise.all([
    countApplications(userId, { status, source, range, q, excludeStatuses }),
    listInboxConnections(userId),
  ]);
  const connection = connections[0] ?? null;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * perPage;
  const apps = total === 0
    ? []
    : await listApplications(userId, {
        status,
        source,
        range,
        q,
        sort,
        dir,
        limit: perPage,
        offset,
        excludeStatuses,
      });
  // Import + export are available to any paid plan (standard or premium).
  const isPaid = !!profile && profile.plan !== 'free';
  // Only label the inbox per row when the user actually has more than one —
  // otherwise it's just noise that repeats the same address on every line.
  const showInbox = connections.length > 1;

  if (!connection) {
    return (
      <div className="mx-auto max-w-2xl pt-10">
        <PillowCard>
          <Eyebrow>GET STARTED</Eyebrow>
          <h1
            className="serif mt-2"
            style={{ fontSize: 32, letterSpacing: '-0.024em', lineHeight: 1.1 }}
          >
            Connect <span className="serif-italic" style={{ color: 'var(--yume-pink-500)' }}>Gmail</span> to begin.
          </h1>
          <div className="mt-5">
            <Link
              href="/api/gmail/connect"
              className="inline-flex items-center rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
              style={{
                background: 'var(--yume-pink-500)',
                boxShadow:
                  '0 14px 26px -10px rgba(232,90,122,0.6), inset 0 1px 0 rgba(255,255,255,0.25)',
              }}
            >
              Connect Gmail
            </Link>
          </div>
        </PillowCard>
      </div>
    );
  }

  // Toggle direction when clicking the active sort column; otherwise default
  // desc for time-based, asc for alphabetical. Reset to page 1 on sort change.
  const sortHref = (column: ApplicationsSortKey) => {
    const isTimeCol = column === 'lastEvent';
    const defaultDir: ApplicationsSortDir = isTimeCol ? 'desc' : 'asc';
    const nextDir: ApplicationsSortDir =
      sort === column ? (dir === 'asc' ? 'desc' : 'asc') : defaultDir;
    return buildUrl({
      status,
      source,
      range,
      q,
      sort: column,
      dir: nextDir,
      perPage: perPage === DEFAULT_PER_PAGE ? undefined : String(perPage),
    });
  };

  // Filter/search changes should reset pagination, so we deliberately omit
  // `page` from preserveBase. perPage is sticky.
  const perPageParam = perPage === DEFAULT_PER_PAGE ? undefined : String(perPage);
  const preserveBase = { status, source, range, q, sort, dir, perPage: perPageParam };
  const pageHref = (target: number) =>
    buildUrl({ ...preserveBase, page: target === 1 ? undefined : String(target) });
  const perPageHref = (n: PerPage) =>
    buildUrl({
      status,
      source,
      range,
      q,
      sort,
      dir,
      perPage: n === DEFAULT_PER_PAGE ? undefined : String(n),
    });
  const pageNumbers = computePageNumbers(page, totalPages);
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = offset + apps.length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow color="var(--yume-pink-600)">ALL APPLICATIONS</Eyebrow>
          <h1
            className="serif mt-1"
            style={{ fontSize: 44, lineHeight: 1, letterSpacing: '-0.028em', color: 'var(--yume-ink)' }}
          >
            Every <span className="serif-italic" style={{ color: 'var(--yume-pink-500)' }}>thread.</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <ImportButton isPaid={isPaid} />
          <ExportButton isPaid={isPaid} />
        </div>
      </div>

      {/* Toolbar: search left, filter dropdowns right */}
      <div className="flex flex-wrap items-center gap-2">
        <form
          action="/app/applications"
          method="get"
          className="relative flex flex-1 items-center"
          style={{ minWidth: 240 }}
        >
          {status && <input type="hidden" name="status" value={status} />}
          {source && <input type="hidden" name="source" value={source} />}
          {range !== 'all' && <input type="hidden" name="range" value={range} />}
          {sort !== 'lastEvent' && <input type="hidden" name="sort" value={sort} />}
          {dir !== 'desc' && <input type="hidden" name="dir" value={dir} />}
          {perPage !== DEFAULT_PER_PAGE && (
            <input type="hidden" name="perPage" value={String(perPage)} />
          )}
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3.5 h-4 w-4 text-yume-ink-muted"
          />
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search company or role…"
            aria-label="Search applications"
            className="h-10 pl-10 pr-10"
          />
          {q && (
            <Link
              href={buildUrl({ ...preserveBase, q: undefined })}
              aria-label="Clear search"
              className="absolute right-3 inline-flex h-6 w-6 items-center justify-center rounded-full text-yume-ink-muted transition-colors hover:bg-yume-pink-50 hover:text-yume-pink-700"
            >
              <X className="h-3.5 w-3.5" />
            </Link>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown
            label="Status"
            activeLabel={status ? STATUS_LABEL[status] : null}
            allLabel="All statuses"
            allHref={buildUrl({ ...preserveBase, status: undefined })}
            isActive={!!status}
            options={APPLICATION_STATUSES.map((s) => ({
              key: s,
              label: STATUS_LABEL[s],
              href: buildUrl({ ...preserveBase, status: s }),
              active: status === s,
            }))}
          />

          <FilterDropdown
            label="Source"
            activeLabel={source ? APPLICATION_SOURCE_LABELS[source] : null}
            allLabel="All sources"
            allHref={buildUrl({ ...preserveBase, source: undefined })}
            isActive={!!source}
            options={APPLICATION_SOURCES.map((s) => ({
              key: s,
              label: APPLICATION_SOURCE_LABELS[s],
              href: buildUrl({ ...preserveBase, source: s }),
              active: source === s,
            }))}
          />

          <FilterDropdown
            label="Range"
            activeLabel={range !== 'all' ? RANGES.find((r) => r.key === range)?.label ?? null : null}
            allLabel="All time"
            allHref={buildUrl({ ...preserveBase, range: undefined })}
            isActive={range !== 'all'}
            options={RANGES.filter((r) => r.key !== 'all').map((r) => ({
              key: r.key,
              label: r.label,
              href: buildUrl({ ...preserveBase, range: r.key }),
              active: range === r.key,
            }))}
          />

          {(status || source || range !== 'all' || q) && (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="rounded-full text-yume-ink-muted hover:text-yume-pink-700"
            >
              <Link href="/app/applications">Clear all</Link>
            </Button>
          )}
        </div>
      </div>

      {apps.length === 0 ? (
        <PillowCard>
          <div className="py-8 text-center text-[13px]" style={{ color: 'var(--yume-ink-soft)' }}>
            {q
              ? `No applications match "${q}".`
              : 'No applications match these filters.'}
          </div>
        </PillowCard>
      ) : (
        <PillowCard padding="8px 12px">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ color: 'var(--yume-ink-muted)' }}>
                <SortableHeader
                  href={sortHref('company')}
                  active={sort === 'company'}
                  dir={dir}
                  label="Company"
                />
                <th
                  className="px-3 py-3 text-left font-semibold"
                  style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}
                >
                  Role
                </th>
                <th
                  className="px-3 py-3 text-left font-semibold"
                  style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}
                >
                  Status
                </th>
                <SortableHeader
                  href={sortHref('source')}
                  active={sort === 'source'}
                  dir={dir}
                  label="Source"
                />
                <SortableHeader
                  href={sortHref('lastEvent')}
                  active={sort === 'lastEvent'}
                  dir={dir}
                  label="Last event"
                />
              </tr>
            </thead>
            <tbody>
              {apps.map((a, i) => (
                <tr
                  key={a.id}
                  className="transition-colors hover:bg-yume-pink-50"
                  style={{
                    borderTop: i === 0 ? 'none' : '1px solid var(--yume-line-faint)',
                  }}
                >
                  <td className="px-3 py-3 font-medium" style={{ color: 'var(--yume-ink)' }}>
                    <Link href={`/app/applications/${a.id}`} className="flex items-center gap-2.5 hover:underline">
                      <CompanyAvatar company={a.company} size={24} />
                      <span className="flex flex-col">
                        <span>{a.company}</span>
                        {showInbox && a.inboxEmails.length > 0 && (
                          <span
                            className="font-normal"
                            style={{ fontSize: 11, color: 'var(--yume-ink-muted)' }}
                          >
                            {a.inboxEmails.join(', ')}
                          </span>
                        )}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3" style={{ color: 'var(--yume-ink-soft)' }}>
                    {a.role ?? '—'}
                  </td>
                  <td className="px-3 py-3">
                    <RowStatusEditor applicationId={a.id} currentStatus={a.status} />
                  </td>
                  <td className="px-3 py-3" style={{ color: 'var(--yume-ink-soft)' }}>
                    <RowSourceEditor
                      applicationId={a.id}
                      currentSourceDomain={a.sourceDomain}
                    />
                  </td>
                  <td className="px-3 py-3" style={{ color: 'var(--yume-ink-soft)' }}>
                    {formatRelative(a.lastEventAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PillowCard>
      )}

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div
            className="flex items-center gap-3 text-[12.5px]"
            style={{ color: 'var(--yume-ink-muted)' }}
          >
            <span>
              {rangeStart}–{rangeEnd} of {total}
            </span>
            <PerPageDropdown current={perPage} hrefFor={perPageHref} />
          </div>

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              {totalPages > 5 && (
                <form
                  action="/app/applications"
                  method="get"
                  className="flex items-center gap-1.5 text-[12.5px]"
                  style={{ color: 'var(--yume-ink-muted)' }}
                >
                  {status && <input type="hidden" name="status" value={status} />}
                  {source && <input type="hidden" name="source" value={source} />}
                  {range !== 'all' && <input type="hidden" name="range" value={range} />}
                  {q && <input type="hidden" name="q" value={q} />}
                  {sort !== 'lastEvent' && <input type="hidden" name="sort" value={sort} />}
                  {dir !== 'desc' && <input type="hidden" name="dir" value={dir} />}
                  {perPage !== DEFAULT_PER_PAGE && (
                    <input type="hidden" name="perPage" value={String(perPage)} />
                  )}
                  <label htmlFor="page-jump">Go to</label>
                  <Input
                    id="page-jump"
                    type="number"
                    name="page"
                    min={1}
                    max={totalPages}
                    defaultValue={page}
                    aria-label={`Jump to page (1 to ${totalPages})`}
                    className="h-8 w-[68px] px-2 text-center"
                  />
                  <span>of {totalPages}</span>
                </form>
              )}

              <Pagination className="m-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href={pageHref(Math.max(1, page - 1))}
                      disabled={page <= 1}
                    />
                  </PaginationItem>
                  {pageNumbers.map((entry, i) =>
                    entry === 'ellipsis' ? (
                      <PaginationItem key={`e-${i}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={entry}>
                        <PaginationLink href={pageHref(entry)} isActive={entry === page}>
                          {entry}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}
                  <PaginationItem>
                    <PaginationNext
                      href={pageHref(Math.min(totalPages, page + 1))}
                      disabled={page >= totalPages}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Build a compact page list with ellipses, e.g. for current=6/total=20:
// [1, 'ellipsis', 5, 6, 7, 'ellipsis', 20]
function computePageNumbers(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const out: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push('ellipsis');
  for (let p = start; p <= end; p++) out.push(p);
  if (end < total - 1) out.push('ellipsis');
  out.push(total);
  return out;
}

function PerPageDropdown({
  current,
  hrefFor,
}: {
  current: PerPage;
  hrefFor: (n: PerPage) => string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-full border-[var(--yume-line)] bg-yume-paper text-[12px] font-medium text-yume-ink-soft hover:bg-yume-pink-50 hover:text-yume-pink-700"
        >
          <span className="text-yume-ink-muted">Per page:</span>
          <span>{current}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[8rem]">
        <DropdownMenuLabel>Rows per page</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PER_PAGE_OPTIONS.map((n) => (
          <DropdownMenuItem key={n} asChild>
            <Link href={hrefFor(n)} className={cn(n === current && 'font-semibold text-yume-pink-700')}>
              {n}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortableHeader({
  href,
  active,
  dir,
  label,
}: {
  href: string;
  active: boolean;
  dir: ApplicationsSortDir;
  label: string;
}) {
  return (
    <th className="px-3 py-3 text-left font-semibold">
      <Link
        href={href}
        className="inline-flex items-center gap-1 transition-colors"
        style={{
          fontSize: 11,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: active ? 'var(--yume-pink-600)' : 'var(--yume-ink-muted)',
        }}
      >
        {label}
        <span aria-hidden style={{ opacity: active ? 1 : 0.35, fontSize: 9 }}>
          {active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </Link>
    </th>
  );
}

interface FilterDropdownProps {
  label: string;
  activeLabel: string | null;
  allLabel: string;
  allHref: string;
  isActive: boolean;
  options: Array<{ key: string; label: string; href: string; active: boolean }>;
}

function FilterDropdown({
  label,
  activeLabel,
  allLabel,
  allHref,
  isActive,
  options,
}: FilterDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-10 gap-1.5 rounded-full border-[var(--yume-line)] bg-yume-paper text-[12.5px] font-medium text-yume-ink-soft hover:bg-yume-pink-50 hover:text-yume-pink-700',
            isActive &&
              'border-[rgba(232,90,122,0.25)] bg-gradient-to-b from-yume-pink-50 to-yume-pink-100 text-yume-pink-700',
          )}
        >
          <span className="text-yume-ink-muted">{label}:</span>
          <span>{activeLabel ?? allLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[14rem]">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href={allHref} className={cn(!isActive && 'font-semibold text-yume-pink-700')}>
            {allLabel}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.map((opt) => (
          <DropdownMenuItem key={opt.key} asChild>
            <Link href={opt.href} className={cn(opt.active && 'font-semibold text-yume-pink-700')}>
              {opt.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

