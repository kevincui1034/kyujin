'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Rule {
  id: string;
  domain: string;
  type: 'allow' | 'block';
  note: string | null;
  createdAt: Date | string;
}

interface Props {
  initialAllow: Rule[];
  initialBlock: Rule[];
}

export function RulesEditor({ initialAllow, initialBlock }: Props) {
  const router = useRouter();
  const [allow, setAllow] = useState<Rule[]>(initialAllow);
  const [block, setBlock] = useState<Rule[]>(initialBlock);
  const [activeType, setActiveType] = useState<'allow' | 'block'>('allow');
  const [domain, setDomain] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function add() {
    setError(null);
    const trimmed = domain.trim();
    if (!trimmed) return;
    const res = await fetch('/api/user-rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: trimmed, type: activeType, note: note || undefined }),
    });
    const json = (await res.json()) as { rule?: Rule; error?: string; hint?: string };
    if (!res.ok || !json.rule || ('duplicate' in (json.rule ?? {}) && (json.rule as { duplicate?: boolean }).duplicate)) {
      setError(json.error === 'invalid_domain' ? (json.hint ?? 'invalid domain') : json.error ?? 'failed');
      return;
    }
    const setter = activeType === 'allow' ? setAllow : setBlock;
    setter((prev) => [...prev, json.rule as Rule].sort((a, b) => a.domain.localeCompare(b.domain)));
    setDomain('');
    setNote('');
    startTransition(() => router.refresh());
  }

  async function remove(rule: Rule) {
    await fetch(`/api/user-rules?id=${encodeURIComponent(rule.id)}`, { method: 'DELETE' });
    const setter = rule.type === 'allow' ? setAllow : setBlock;
    setter((prev) => prev.filter((r) => r.id !== rule.id));
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-5">
      <Tabs
        value={activeType}
        onValueChange={(v) => setActiveType(v as 'allow' | 'block')}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="allow">Allowlist ({allow.length})</TabsTrigger>
          <TabsTrigger value="block">Blocklist ({block.length})</TabsTrigger>
        </TabsList>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
          className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
        >
          <Input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder={activeType === 'allow' ? 'careers.acme.com' : 'mailchimp.com'}
            autoComplete="off"
          />
          <Input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            maxLength={200}
          />
          <Button type="submit" variant="outline">
            Add to {activeType === 'allow' ? 'allowlist' : 'blocklist'}
          </Button>
        </form>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

        <TabsContent value="allow">
          <RuleList rules={allow} type="allow" onRemove={remove} />
        </TabsContent>
        <TabsContent value="block">
          <RuleList rules={block} type="block" onRemove={remove} />
        </TabsContent>
      </Tabs>

      <p className="text-[11px] text-muted-foreground">
        Allow rules force the LLM to classify mail from that sender even if Yume would otherwise
        skip it. Block rules drop mail from that sender silently. Block wins ties.
      </p>
    </div>
  );
}

function RuleList({
  rules,
  type,
  onRemove,
}: {
  rules: Rule[];
  type: 'allow' | 'block';
  onRemove: (rule: Rule) => void;
}) {
  if (rules.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No {type === 'allow' ? 'allowlist' : 'blocklist'} entries yet.
      </p>
    );
  }
  return (
    <ul className="divide-y rounded-md border">
      {rules.map((rule) => (
        <li key={rule.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <div className="min-w-0">
            <div className="truncate font-medium">{rule.domain}</div>
            {rule.note && (
              <div className="truncate text-xs text-muted-foreground">{rule.note}</div>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => onRemove(rule)}>
            Remove
          </Button>
        </li>
      ))}
    </ul>
  );
}
