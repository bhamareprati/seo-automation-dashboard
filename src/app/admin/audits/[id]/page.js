import { notFound } from 'next/navigation';
import { AuditProgress } from '@/components/AuditProgress';
import { prisma } from '@/lib/prisma';

export const metadata = { title: 'Audit | SEO Automation Dashboard' };

export default async function AuditPage({ params }) {
  const audit = await prisma.audit.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      progress: true,
      currentStep: true,
      overallScore: true,
      triggeredBy: true,
      errorMessage: true,
      createdAt: true,
      client: { select: { name: true, websiteUrl: true } },
      report: { select: { auditId: true } },
    },
  });
  if (!audit) notFound();

  const { client, report, ...initial } = audit;
  const started = audit.createdAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

  return (
    <>
      <h1 className="text-title">{client.name}</h1>
      <p className="mt-1 break-all text-data text-muted-foreground">{client.websiteUrl}</p>
      <p className="text-data text-muted-foreground">
        Started {started}. {audit.triggeredBy === 'cron' ? 'Monthly schedule.' : 'Started manually.'}
      </p>
      <AuditProgress
        auditId={audit.id}
        clientName={client.name}
        initial={{ ...initial, createdAt: audit.createdAt.toISOString(), hasReport: Boolean(report) }}
      />
    </>
  );
}
