import Link from 'next/link';
import { AutoRefresh } from '@/components/AutoRefresh';
import { Progress } from '@/components/ui/progress';
import { ACTIVE_STATUSES, STATUS_DISPLAY } from '@/lib/auditSteps';
import { message } from '@/lib/messages';
import { prisma } from '@/lib/prisma';
import { flagForScore } from '@/lib/referenceRanges';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Worklist | SEO Automation Dashboard' };

const SHORT_DATE = { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' };
const CHANNEL_LABEL = { whatsapp: 'WhatsApp', email: 'Email' };

const select = {
  id: true,
  status: true,
  progress: true,
  currentStep: true,
  overallScore: true,
  triggeredBy: true,
  errorMessage: true,
  createdAt: true,
  completedAt: true,
  client: { select: { name: true } },
};

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

function SectionHeading({ children }) {
  return <h2 className="mb-1 mt-8 border-b pb-2 text-section">{children}</h2>;
}

export default async function WorklistPage() {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [clientCount, active, attention, recent, finishedThisMonth, notifications] = await Promise.all([
    prisma.client.count(),
    prisma.audit.findMany({ where: { status: { in: ACTIVE_STATUSES } }, orderBy: { createdAt: 'desc' }, select }),
    prisma.audit.findMany({
      where: { OR: [{ status: 'FAILED' }, { status: 'COMPLETED', errorMessage: { not: null } }] },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select,
    }),
    prisma.audit.findMany({ where: { status: 'COMPLETED' }, orderBy: { completedAt: 'desc' }, take: 5, select }),
    prisma.audit.count({ where: { status: 'COMPLETED', completedAt: { gte: monthStart } } }),
    prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, channel: true, createdAt: true, audit: { select: { client: { select: { name: true } } } } },
    }),
  ]);

  if (clientCount === 0) {
    return (
      <>
        <h1 className="text-title">Worklist</h1>
        <p className="mt-4 text-muted-foreground">{message('M-EMPTY-CLIENTS')}</p>
        <p className="mt-4">
          <Link href="/admin/clients" className="text-methylene underline-offset-4 hover:underline">
            Add client
          </Link>
        </p>
      </>
    );
  }

  const running = active.filter((a) => a.status === 'RUNNING').length;
  const waiting = active.length - running;

  return (
    <>
      <AutoRefresh everyMs={active.length ? 2000 : 30000} />
      <h1 className="max-w-prose text-title">
        {plural(running, 'audit', 'audits')} running, {waiting} waiting, {finishedThisMonth} finished this month,{' '}
        {attention.length} {attention.length === 1 ? 'needs' : 'need'} attention.
      </h1>

      <SectionHeading>Running now</SectionHeading>
      {active.length === 0 ? (
        <p className="py-3 text-muted-foreground">
          {recent.length === 0 ? message('M-EMPTY-AUDITS') : 'Nothing is running. Start an audit from the client list.'}
        </p>
      ) : (
        <ul>
          {active.map((audit) => (
            <li key={audit.id} className="border-b py-3 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/admin/audits/${audit.id}`} className="font-medium text-methylene underline-offset-4 hover:underline">
                  {audit.client.name}
                </Link>
                <span className="text-data text-muted-foreground">{audit.currentStep}</span>
              </div>
              <Progress
                value={audit.progress}
                aria-label={`${audit.client.name} audit progress`}
                aria-valuenow={audit.progress}
                className="mt-2 h-2"
              />
            </li>
          ))}
        </ul>
      )}

      {attention.length ? (
        <>
          <SectionHeading>Needs attention</SectionHeading>
          <ul>
            {attention.map((audit) => (
              <li key={audit.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b py-3 last:border-b-0">
                <Link href={`/admin/audits/${audit.id}`} className="font-medium text-methylene underline-offset-4 hover:underline">
                  {audit.client.name}
                </Link>
                <span className="min-w-0 max-w-prose text-data text-poor">{audit.errorMessage}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <SectionHeading>Recently finished</SectionHeading>
      {recent.length === 0 ? (
        <p className="py-3 text-muted-foreground">{message('M-EMPTY-AUDITS')}</p>
      ) : (
        <ul>
          {recent.map((audit) => {
            const flag = audit.overallScore === null ? null : flagForScore(audit.overallScore);
            return (
              <li key={audit.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b py-3 last:border-b-0">
                <Link href={`/admin/audits/${audit.id}`} className="font-medium text-methylene underline-offset-4 hover:underline">
                  {audit.client.name}
                </Link>
                <span className="text-data">
                  {audit.overallScore ?? '—'} {flag}{' '}
                  <span className="text-muted-foreground">
                    {audit.completedAt?.toLocaleDateString('en-IN', SHORT_DATE)}.{' '}
                    {audit.triggeredBy === 'cron' ? 'Monthly' : 'Manual'}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {notifications.length ? (
        <>
          <SectionHeading>Notifications</SectionHeading>
          <ul className="text-data">
            {notifications.map((n) => (
              <li key={n.id} className={cn('border-b py-2 last:border-b-0', STATUS_DISPLAY.QUEUED.className)}>
                {message('M-NOTIF-CHANNEL', { channel: CHANNEL_LABEL[n.channel] || n.channel, client: n.audit.client.name })}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
