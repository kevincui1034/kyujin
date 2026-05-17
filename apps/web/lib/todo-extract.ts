import { generateObject } from 'ai';
import { google, AGENT_DEFAULT_MODEL_ID } from '@kyujin/shared';
import { z } from 'zod';

// Best-effort company + position extraction from a saved job URL. Pipeline:
//   1. Fetch the URL's HTML (size-capped, short timeout, redirects allowed,
//      private IPs rejected before the request goes out).
//   2. Pull OG / Twitter / <title> tags out with regex.
//   3. If either field is still missing, hand the head of the page text to
//      Gemini Flash Lite for a second attempt.
// Failures are non-fatal — the caller stores whatever was parsed (possibly
// nothing) and lets the user edit the row.

const MAX_BYTES = 1024 * 200; // 200 KB of HTML is more than enough for <head>.
const FETCH_TIMEOUT_MS = 6000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; KyujinBot/1.0; +https://kyujin.dev)';
const LLM_MODEL_ID = AGENT_DEFAULT_MODEL_ID;

export interface ExtractedMetadata {
  company: string | null;
  position: string | null;
}

export async function extractJobMetadata(rawUrl: string): Promise<ExtractedMetadata> {
  const safe = sanitizeUrl(rawUrl);
  if (!safe) return { company: null, position: null };

  const html = await fetchHtml(safe).catch(() => null);
  if (!html) return { company: null, position: null };

  const fromMeta = parseMetaTags(html);
  if (fromMeta.company && fromMeta.position) return fromMeta;

  // Skip the LLM call when no API key is configured — the OG-tag result is
  // still useful on its own.
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.GOOGLE_API_KEY) {
    return fromMeta;
  }

  const fromLlm = await extractWithLlm(html, fromMeta).catch(() => null);
  if (!fromLlm) return fromMeta;

  return {
    company: fromMeta.company ?? fromLlm.company ?? null,
    position: fromMeta.position ?? fromLlm.position ?? null,
  };
}

// Reject anything that isn't http(s) and refuse hostnames that resolve into
// link-local / loopback / RFC1918 space. The Node DNS lookup happens inside
// fetch, so we additionally pre-check the literal-IP case here as a cheap
// guard against the most obvious SSRF inputs.
function sanitizeUrl(input: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (isPrivateHost(parsed.hostname)) return null;
  return parsed;
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  // IPv4 literal
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  // IPv6 loopback / link-local
  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) {
    return true;
  }
  return false;
}

async function fetchHtml(url: URL): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('html')) return null;

    const reader = res.body?.getReader();
    if (!reader) return await res.text();
    const decoder = new TextDecoder();
    let out = '';
    let read = 0;
    while (read < MAX_BYTES) {
      const { value, done } = await reader.read();
      if (done) break;
      read += value.byteLength;
      out += decoder.decode(value, { stream: true });
    }
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}

function parseMetaTags(html: string): ExtractedMetadata {
  const head = html.slice(0, Math.min(html.length, 64 * 1024));
  const ogTitle = matchMeta(head, 'og:title') ?? matchMeta(head, 'twitter:title');
  const ogSite = matchMeta(head, 'og:site_name');
  const docTitle = matchDocTitle(head);

  const rawTitle = (ogTitle ?? docTitle ?? '').trim();
  const rawSite = (ogSite ?? '').trim();

  const split = splitTitle(rawTitle);

  return {
    company: cleanField(rawSite || split.company),
    position: cleanField(split.position || rawTitle || null),
  };
}

function matchMeta(html: string, prop: string): string | null {
  // Match either <meta property="og:title" content="..."> or the name= form.
  const rx = new RegExp(
    `<meta[^>]+(?:property|name)\\s*=\\s*['"]${escapeRx(prop)}['"][^>]*?content\\s*=\\s*['"]([^'"]+)['"]`,
    'i',
  );
  const m = rx.exec(html);
  if (m && m[1]) return decodeHtmlEntities(m[1]);
  // Also try content=... before property=
  const rx2 = new RegExp(
    `<meta[^>]+content\\s*=\\s*['"]([^'"]+)['"][^>]*?(?:property|name)\\s*=\\s*['"]${escapeRx(prop)}['"]`,
    'i',
  );
  const m2 = rx2.exec(html);
  return m2 && m2[1] ? decodeHtmlEntities(m2[1]) : null;
}

function matchDocTitle(html: string): string | null {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return m && m[1] ? decodeHtmlEntities(m[1]).trim() : null;
}

function escapeRx(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// Job titles often arrive as "Senior Engineer at Acme · Greenhouse" or
// "Senior Engineer | Acme Careers" — split on common separators and pull the
// company side out when it looks distinct from boilerplate.
function splitTitle(title: string): { position: string | null; company: string | null } {
  if (!title) return { position: null, company: null };
  const seps = [' at ', ' @ ', ' - ', ' | ', ' · ', ' — ', ' – '];
  for (const sep of seps) {
    const idx = title.toLowerCase().indexOf(sep);
    if (idx > 0) {
      const left = title.slice(0, idx).trim();
      const right = title.slice(idx + sep.length).trim();
      // Drop trailing site labels ("Greenhouse", "Lever", "Workday", "Careers").
      const company = stripBoilerplate(right);
      return { position: left || null, company: company || null };
    }
  }
  return { position: title, company: null };
}

function stripBoilerplate(s: string): string {
  const cleaned = s
    .replace(/\s*[|·—–-]\s*(?:Greenhouse|Lever|Workday|Ashby|Careers?|Jobs?|Hiring)\s*$/i, '')
    .replace(/\s*(?:Careers?|Jobs?|Hiring)\s*$/i, '')
    .trim();
  return cleaned;
}

function cleanField(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().slice(0, 200);
  return trimmed.length > 0 ? trimmed : null;
}

const LLM_SCHEMA = z.object({
  company: z.string().nullable(),
  position: z.string().nullable(),
});

async function extractWithLlm(
  html: string,
  partial: ExtractedMetadata,
): Promise<ExtractedMetadata> {
  // Strip scripts/styles and collapse whitespace before sending to the model.
  // Most ATS pages still have the role/company in the visible text even when
  // the meta tags are absent.
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);

  const prompt = [
    'Extract the company name and job position title from this job posting page.',
    'Return null for either field if you cannot determine it confidently.',
    partial.company ? `Hint: company is likely "${partial.company}".` : null,
    partial.position ? `Hint: position is likely "${partial.position}".` : null,
    '',
    'Page text:',
    text,
  ]
    .filter(Boolean)
    .join('\n');

  const { object } = await generateObject({
    model: google(LLM_MODEL_ID),
    schema: LLM_SCHEMA,
    prompt,
    temperature: 0,
  });

  return {
    company: cleanField(object.company),
    position: cleanField(object.position),
  };
}
