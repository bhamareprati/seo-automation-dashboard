'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { ACTIVE_STATUSES, AUDIT_STEPS, STATUS_DISPLAY } from '@/lib/auditSteps';
import { message } from '@/lib/messages';
import { cn } from '@/lib/utils';

const POLL_MS = 2000;

/** done, current or pending, from the audit's status and current step. */
function stepState(step, index, audit) {
  if (audit.status === 'COMPLETED') return 'done';
  const currentIndex = AUDIT_STEPS.findIndex((s) => s.label === audit.currentStep || s.sampleLabel === audit.currentStep);
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

export function AuditProgress({ auditId, clientName, initial }) {
  const [audit, setAudit] = useState(initial);
  const [stale, setStale] = useState(false);
  const previousStatus = useRef(initial.status);
  const active = ACTIVE_STATUSES.includes(audit.status);

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
    if (previousStatus.current !== audit.status && audit.status === 'COMPLETED' && audit.overallScore !== null) {
      toast(message('M-AUDIT-DONE', { client: clientName, score: audit.overallScore }));
    }
    previousStatus.current = audit.status;
  }, [audit.status, audit.overallScore, clientName]);

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
      <p className="mt-2 text-data tabular-nums">{audit.progress}%</p>

      <p aria-live="polite" data-testid="current-step" className="mt-1 text-muted-foreground">
        {active ? stepText : null}
      </p>

      {stale ? <p className="mt-1 text-data text-muted-foreground">Reconnecting to get the latest progress.</p> : null}

      {audit.errorMessage ? (
        <p role="alert" data-testid="audit-error" className="mt-3 text-poor">
          {audit.errorMessage}
        </p>
      ) : null}

      {audit.status === 'COMPLETED' && audit.hasReport ? (
        <p className="mt-4">
          <a
            href={`/api/audit/${auditId}/report`}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-data font-medium text-primary-foreground hover:bg-primary/90"
          >
            Download PDF
          </a>
        </p>
      ) : null}

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
                {step.sampleLabel && audit.currentStep === step.sampleLabel ? step.sampleLabel : step.sampleLabel && audit.dataMode?.aiSource === 'mock' ? step.sampleLabel : step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
