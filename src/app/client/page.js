import { ReportView } from '@/components/ReportView';
import { ACTIVE_STATUSES } from '@/lib/auditSteps';
import { message } from '@/lib/messages';
import { prisma } from '@/lib/prisma';
import { requirePageRole } from '../_server/session';

export const metadata = { title: 'Your report | SEO Automation Dashboard' };

const dateText = (date) =>
  date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

export default async function ClientHomePage() {
  // The client ID comes only from the signed session, so no URL or input can show another client's report.
  const { clientId } = await requirePageRole('client');

  const [latest, report] = await Promise.all([
    prisma.audit.findFirst({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    }),
    prisma.audit.findFirst({
      where: { clientId, status: 'COMPLETED', result: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        result: true,
        signals: true,
        createdAt: true,
        completedAt: true,
        report: { select: { auditId: true } },
        notifications: { take: 1, select: { id: true } },
      },
    }),
  ]);

  const running = latest && ACTIVE_STATUSES.includes(latest.status);

  return (
    <>
      {latest?.status === 'FAILED' && report ? (
        <p role="status" className="mb-4 border-l-4 border-watch bg-sheet px-3 py-2 text-data">
          {message('M-CLIENT-FAILED')}
        </p>
      ) : null}
      {running && report ? (
        <p role="status" className="mb-4 border-l-4 border-methylene bg-sheet px-3 py-2 text-data">
          A new audit is running. This is your previous report.
        </p>
      ) : null}
      {report?.notifications.length ? (
        <p className="mb-4 text-data text-muted-foreground">
          {message('M-NOTIF-READY', { date: dateText(report.completedAt || report.createdAt) })}
        </p>
      ) : null}

      {report ? (
        <ReportView
          result={report.result}
          signals={report.signals}
          createdAt={report.createdAt}
          auditId={report.id}
          canDownload={Boolean(report.report)}
        />
      ) : (
        <>
          <h1 className="text-title">Your report</h1>
          <p className="mt-4 text-muted-foreground">{message('M-CLIENT-EMPTY')}</p>
        </>
      )}
    </>
  );
}
