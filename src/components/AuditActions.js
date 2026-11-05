'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { message } from '@/lib/messages';

/** Retry a failed audit, or rebuild a missing PDF. Finished steps are skipped, so Claude isn't paid for twice. */
export function RetryButton({ auditId, label }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    try {
      const res = await fetch(`/api/audit/${auditId}/retry`, { method: 'POST' });
      if (res.status === 202) {
        router.refresh();
        return;
      }
      const data = await res.json();
      toast.error(data.error);
    } catch {
      toast.error(message('M-QUEUE-DOWN'));
    }
    setBusy(false);
  }

  return (
    <Button onClick={retry} disabled={busy}>
      {label}
    </Button>
  );
}

export function CopyJsonButton({ text }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="outline" size="sm" onClick={copy}>
      {copied ? 'Copied' : 'Copy JSON'}
    </Button>
  );
}
