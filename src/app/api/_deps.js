import { waitUntil } from '@vercel/functions';
import { createAuditIfIdle } from '@/lib/audits';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { enqueueAudit } from '@/lib/queue';
import { runCronTick, runOneJob } from '@/pipeline';

/** Keeps the function alive after the response. Vercel cancels this at the function's time limit. */
export function runInBackground(work) {
  waitUntil(
    Promise.resolve()
      .then(work)
      .catch((err) => logger.error('background_failed', { code: err?.code || err?.name })),
  );
}

export const auditDeps = () => ({
  env: getEnv(),
  prisma,
  createAuditIfIdle,
  enqueue: enqueueAudit,
  startRunner: () => runInBackground(runOneJob),
});

export const cronDeps = () => ({
  env: getEnv(),
  runInBackground,
  tick: runCronTick,
});
