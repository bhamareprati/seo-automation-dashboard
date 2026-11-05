'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { ACTIVE_STATUSES, AUDIT_STEPS, STATUS_DISPLAY, stepDisplayLabel } from '@/lib/auditSteps';
import { message } from '@/lib/messages';
import { cn } from '@/lib/utils';

const POLL_MS = 2000;

const isCurrent = (step, audit) => step.label === audit.currentStep || step.sampleLabel === audit.currentStep;

/** done, current or pending, from the audit's status and current step. */
function stepState(step, index, audit) {
  if (audit.status === 'COMPLETED') return 'done';
  const currentIndex = AUDIT_STEPS.findIndex((s) => isCurrent(s, audit));
  if (currentIndex === -1) return 'pending';
  if (index < currentIndex) return 'done';
  if (index === currentIndex) return audit.status === 'FAILED' ? 'failed' : 'current';
  return 'pending';
}

const STEP_MARK = {
  done: { mark: '✓', className: 'text-good', sr: 'Done' },
  current: { mark: '●', className: 'text-methylene', sr: 'In progress' },
  failed: { mark: '✕', className: 'text-poor', sr: 'Stopped here' },
  pending: { mark: '○', className: 'text-muted-foreground', sr: 'Not started' },
};

export function AuditProgress({ auditId, clientName, initial, queueName, usesSampleAnalysis }) {
  const router = useRouter();
  const [audit, setAudit] = useState(initial);
  const [stale, setStale] = useState(false);
  const previousStatus = useRef(initial.status);
  const active = ACTIVE_STATUSES.includes(audit.status);

  // A retry changes the audit on the server, so take the new state when the page reloads its data.
  useEffect(() => {
    setAudit(initial);
    previousStatus.current = initial.status;
  }, [initial]);

  useEffect(() => {
    if (!active) return undefined;
    let stopped = false;
    let timer;

    async function poll() {
      // Don't spend requests on a tab nobody is looking at.
      if (!document.hidden) {
        try {
          const res = await fetch(`/api/audit/${auditId}`, { cache: 'no-store' });
          if (!res.ok) throw new Error(String(res.status));
          const next = await res.json();
          if (!stopped) {
            setAudit(next);
            setStale(false);
          }
        } catch {
          if (!stopped) setStale(true);
        }
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    }

    timer = setTimeout(poll, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [active, auditId]);

  useEffect(() => {
    const finished = ACTIVE_STATUSES.includes(previousStatus.current) && !ACTIVE_STATUSES.includes(audit.status);
    previousStatus.current = audit.status;
    if (!finished) return;
    if (audit.status === 'COMPLETED' && audit.overallScore !== null) {
      toast(message('M-AUDIT-DONE', { client: clientName, score: audit.overallScore }));
    }
    router.refresh(); // Loads the finished report and tabs from the server.
  }, [audit.status, audit.overallScore, clientName, router]);

  const display = STATUS_DISPLAY[audit.status];
  const stepText = audit.status === 'QUEUED' ? message('M-QUEUED') : audit.currentStep;

  return (
    <section aria-label="Audit progress" className="mt-6 max-w-prose">
      <p data-testid="audit-status" className={cn('font-bold', display.className)}>
        {display.label}
      </p>

      <Progress
        value={audit.progress}
        aria-label="Audit progress"
        aria-valuenow={audit.progress}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-3 h-2"
      />
      <p className="mt-2 text-data">{audit.progress}%</p>

      <p aria-live="polite" data-testid="current-step" className="mt-1 text-muted-foreground">
        {active ? stepText : null}
      </p>

      {stale ? <p className="mt-1 text-data text-muted-foreground">{message('M-RECONNECTING')}</p> : null}

      {audit.errorMessage ? (
        <p role="alert" data-testid="audit-error" className="mt-3 text-poor">
          {audit.errorMessage}
        </p>
      ) : null}

      {audit.status !== 'COMPLETED' ? (
        <>
          <ol className="mt-6 space-y-1 text-data">
            {AUDIT_STEPS.map((step, index) => {
              const state = stepState(step, index, audit);
              const { mark, className, sr } = STEP_MARK[state];
              return (
                <li key={step.key} className="flex gap-2">
                  <span aria-hidden="true" className={cn('w-4 shrink-0 text-center', className)}>
                    {mark}
                  </span>
                  <span className={state === 'pending' ? 'text-muted-foreground' : undefined}>
                    <span className="sr-only">{sr}: </span>
                    {stepDisplayLabel(step, { aiSource: audit.dataMode?.aiSource, usesSampleAnalysis })}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 break-all text-label font-normal text-muted-foreground">
            Queue {queueName}. Job {auditId}.
          </p>
        </>
      ) : null}
    </section>
  );
}
