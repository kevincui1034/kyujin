'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImportDialog } from './import-dialog';

interface Props {
  isPaid: boolean;
}

export function ImportButton({ isPaid }: Props) {
  const [open, setOpen] = useState(false);

  if (!isPaid) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        title="A paid plan is required to import"
        className="h-10 rounded-full text-kyujin-ink-muted"
      >
        🔒 Import
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-10 rounded-full"
      >
        <Upload className="mr-1.5 h-3.5 w-3.5" />
        Import
      </Button>
      <ImportDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
