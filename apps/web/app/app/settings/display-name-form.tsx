'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  initialName: string | null;
  email: string;
}

export function DisplayNameForm({ initialName, email }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName ?? '');
  const [savedName, setSavedName] = useState(initialName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [, startTransition] = useTransition();

  const dirty = name.trim() !== (savedName ?? '');

  async function save() {
    setError(null);
    setStatus('saving');
    const res = await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      name?: string | null;
      error?: string;
      hint?: string;
    };
    if (!res.ok) {
      setStatus('idle');
      setError(json.hint ?? json.error ?? 'failed');
      return;
    }
    const saved = json.name ?? '';
    setSavedName(saved);
    setName(saved);
    setStatus('saved');
    startTransition(() => router.refresh());
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && status !== 'saving') void save();
      }}
      className="space-y-2"
    >
      <Label htmlFor="display-name">Display name</Label>
      <div className="flex gap-2">
        <Input
          id="display-name"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value.replace(/[^A-Za-z0-9]/g, ''));
            if (status === 'saved') setStatus('idle');
          }}
          placeholder={email}
          maxLength={30}
          pattern="[A-Za-z0-9]*"
          className="w-80"
          autoComplete="off"
        />
        <Button type="submit" variant="outline" disabled={!dirty || status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Save'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Letters and numbers only, max 30 characters.
        Leave blank to fall back to your email.
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {status === 'saved' && !error && (
        <p className="text-xs text-emerald-600">Saved.</p>
      )}
    </form>
  );
}
