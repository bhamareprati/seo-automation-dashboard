'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { message } from '@/lib/messages';

/** Starts an audit and opens it. If one is already running, opens that one instead. */
export function RunAuditButton({ clientId, label = 'Run audit', size = 'sm' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (res.status === 202 || res.status === 409) {
        if (res.status === 409) toast(message('M-AUDIT-ACTIVE'));
        router.push(`/admin/audits/${data.auditId}`);
        return;
      }
      toast.error(data.error);
      setBusy(false);
    } catch {
      toast.error(message('M-QUEUE-DOWN'));
      setBusy(false);
    }
  }

  return (
    <Button size={size} onClick={run} disabled={busy}>
      {label}
    </Button>
  );
}
