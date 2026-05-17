'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const CATEGORIES = [
  { value: 'bug', label: 'Bug' },
  { value: 'idea', label: 'Idea' },
  { value: 'other', label: 'Other' },
] as const;

type Category = (typeof CATEGORIES)[number]['value'];

const MAX_MESSAGE_LEN = 4000;

export function FeedbackForm() {
  const [category, setCategory] = useState<Category>('idea');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const trimmed = message.trim();
  const canSend = trimmed.length > 0 && status !== 'sending';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setError(null);
    setStatus('sending');
    const res = await fetch('/api/user/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category, message: trimmed }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      hint?: string;
    };
    if (!res.ok || !json.ok) {
      setStatus('idle');
      setError(json.hint ?? json.error ?? 'failed to send');
      return;
    }
    setMessage('');
    setStatus('sent');
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="feedback-category">Type</Label>
        <Select
          value={category}
          onValueChange={(v) => {
            setCategory(v as Category);
            if (status === 'sent') setStatus('idle');
          }}
        >
          <SelectTrigger id="feedback-category" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="feedback-message">Message</Label>
        <Textarea
          id="feedback-message"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            if (status === 'sent') setStatus('idle');
          }}
          maxLength={MAX_MESSAGE_LEN}
          rows={5}
          placeholder="What worked, what didn't, what you wish existed…"
        />
        <p className="text-xs text-muted-foreground">
          {trimmed.length}/{MAX_MESSAGE_LEN}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={!canSend}>
          {status === 'sending' ? 'Sending…' : 'Send feedback'}
        </Button>
        {status === 'sent' && !error && (
          <span className="text-xs text-emerald-600">Thanks — we got it.</span>
        )}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </form>
  );
}
