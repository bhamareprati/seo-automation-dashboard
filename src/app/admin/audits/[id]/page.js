import { notFound } from 'next/navigation';
import { RetryButton, CopyJsonButton } from '@/components/AuditActions';
import { AuditProgress } from '@/components/AuditProgress';
import { ReportView } from '@/components/ReportView';
import { RunAuditButton } from '@/components/RunAuditButton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AUDIT_STEPS } from '@/lib/auditSteps';
import { message } from '@/lib/messages';
import { prisma } from '@/lib/prisma';
import { JOB_NAME, QUEUE_NAME, getAuditQueue } from '@/lib/queue';

export const metadata = { title: 'Audit | SEO Automation Dashboard' };

const CHANNEL_LABEL = { whatsapp: 'WhatsApp', email: 'Email' };
const SIGNAL_SECTIONS = [
  ['onPage', 'On-page'],
  ['technical', 'Technical'],
  ['schema', 'Structured data'],
  ['cwv', 'PageSpeed (Core Web Vitals)'],
  ['gsc', 'Search Console'],
  ['rankings', 'Keyword rankings'],
  ['crawl', 'Crawl'],
  ['meta', 'Audit details'],
];

const dateTime = (date) =>
  date?.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

function JsonBlock({ value }) {
  return (
    <pre className="mt-2 max-h-[32rem] overflow-auto bg-slide p-3 text-label font-normal">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-6 border-b py-2 text-data last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all text-right">{children}</dd>
    </div>
  );
}

/** Reads the BullMQ job's live details. A Redis problem must not stop the page loading. */
async function loadJob(auditId) {
  try {
    const queue = getAuditQueue();
    await queue.waitUntilReady();
    const job = await queue.getJob(auditId);
    if (!job) return null;
    return { state: await job.getState(), attemptsMade: job.attemptsMade, attempts: job.opts?.attempts };
  } catch {
    return null;
  }
}

export default async function AuditPage({ params }) {
  const audit = await prisma.audit.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      clientId: true,
      status: true,
      progress: true,
      currentStep: true,
      overallScore: true,
      triggeredBy: true,
      errorMessage: true,
      createdAt: true,
      completedAt: true,
      pdfPath: true,
      result: true,
      signals: true,
      client: { select: { name: true, websiteUrl: true } },
      report: { select: { sizeBytes: true } },
      notifications: { orderBy: { createdAt: 'asc' }, select: { id: true, channel: true, status: true, providerId: true, createdAt: true } },
    },
  });
  if (!audit) notFound();

  const { client, report, result, signals, notifications } = audit;
  const meta = signals?.meta;
  const job = await loadJob(audit.id);
  const canGeneratePdf = audit.status === 'COMPLETED' && !report;
  const canRetry = audit.status === 'FAILED';
  const finished = audit.status === 'COMPLETED' || audit.status === 'FAILED';
  const tookSeconds = audit.completedAt ? Math.round((audit.completedAt - audit.createdAt) / 1000) : null;

  return (
    <>
      <h1 className="text-title">{client.name}</h1>
      <p className="mt-1 break-all text-data text-muted-foreground">{client.websiteUrl}</p>
      <p className="text-data text-muted-foreground">
        Started {dateTime(audit.createdAt)}. {audit.triggeredBy === 'cron' ? 'Monthly schedule.' : 'Started manually.'}
        {tookSeconds !== null ? ` Took ${tookSeconds} s.` : ''}
      </p>

      <AuditProgress
        auditId={audit.id}
        clientName={client.name}
        queueName={QUEUE_NAME}
        initial={{
          status: audit.status,
          progress: audit.progress,
          currentStep: audit.currentStep,
          overallScore: audit.overallScore,
          errorMessage: audit.errorMessage,
          hasReport: Boolean(report),
          dataMode: { usedMocks: meta?.usedMocks, aiSource: meta?.aiSource || null },
        }}
      />

      {finished ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {report ? (
            <a
              href={`/api/audit/${audit.id}/report`}
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-data font-medium text-primary-foreground hover:bg-primary/90"
            >
              Download PDF
            </a>
          ) : null}
          {canGeneratePdf ? <RetryButton auditId={audit.id} label="Generate PDF" /> : null}
          {canRetry ? <RetryButton auditId={audit.id} label="Retry" /> : null}
          <RunAuditButton clientId={audit.clientId} label="Run again" size="default" />
        </div>
      ) : null}

      {result ? (
        <Tabs defaultValue="report" className="mt-8">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="report">Report</TabsTrigger>
            <TabsTrigger value="signals">Signals</TabsTrigger>
            <TabsTrigger value="json">Claude JSON</TabsTrigger>
            <TabsTrigger value="delivery">Delivery</TabsTrigger>
            <TabsTrigger value="job">Job</TabsTrigger>
          </TabsList>

          <TabsContent value="report" className="mt-4 max-w-sheet">
            <ReportView
              result={result}
              signals={signals}
              createdAt={audit.createdAt}
              auditId={audit.id}
              headline="h2"
              showDownload={false}
            />
          </TabsContent>

          <TabsContent value="signals" className="mt-4 max-w-sheet bg-sheet p-4">
            <p className="text-data text-muted-foreground">The raw data collected before the analysis.</p>
            {SIGNAL_SECTIONS.filter(([key]) => signals?.[key]).map(([key, label]) => (
              <details key={key} className="mt-3 border-b pb-3">
                <summary className="cursor-pointer font-medium">{label}</summary>
                <JsonBlock value={signals[key]} />
              </details>
            ))}
          </TabsContent>

          <TabsContent value="json" className="mt-4 max-w-sheet bg-sheet p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p data-testid="json-source" className="text-data">
                {meta?.aiSource === 'claude' ? message('M-AI-REAL', { model: meta.model }) : message('M-AI-SAMPLE')}
              </p>
              <CopyJsonButton text={JSON.stringify(result, null, 2)} />
            </div>
            <JsonBlock value={result} />
          </TabsContent>

          <TabsContent value="delivery" className="mt-4 max-w-sheet bg-sheet p-4">
            <p className="text-data text-muted-foreground">{message('M-DELIVERY-SIM')}</p>
            {notifications.length ? (
              <div className="mt-3 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Provider ID</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notifications.map((n) => (
                      <TableRow key={n.id}>
                        <TableCell>{CHANNEL_LABEL[n.channel] || n.channel}</TableCell>
                        <TableCell className={n.status === 'failed' ? 'text-poor' : undefined}>{n.status}</TableCell>
                        <TableCell className="break-all">{n.providerId || '—'}</TableCell>
                        <TableCell>{dateTime(n.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="mt-3 text-data">No delivery has been recorded for this audit yet.</p>
            )}
          </TabsContent>

          <TabsContent value="job" className="mt-4 max-w-sheet bg-sheet p-4">
            <dl>
              <DetailRow label="Queue">{QUEUE_NAME}</DetailRow>
              <DetailRow label="Job name">{JOB_NAME}</DetailRow>
              <DetailRow label="Job ID">{audit.id}</DetailRow>
              <DetailRow label="Job state">{job?.state || 'Already removed from the queue'}</DetailRow>
              <DetailRow label="Attempts">{job ? `${job.attemptsMade} of ${job.attempts}` : '—'}</DetailRow>
              <DetailRow label="Trigger">{audit.triggeredBy}</DetailRow>
              <DetailRow label="Analysis source">{meta?.aiSource || '—'}</DetailRow>
              <DetailRow label="Model">{meta?.model || 'None, sample analysis'}</DetailRow>
              <DetailRow label="Input tokens">{meta?.usage?.inputTokens ?? '—'}</DetailRow>
              <DetailRow label="Output tokens">{meta?.usage?.outputTokens ?? '—'}</DetailRow>
              <DetailRow label="Report file">{audit.pdfPath || '—'}</DetailRow>
              <DetailRow label="Report size">{report ? `${Math.round(report.sizeBytes / 1024)} KB` : '—'}</DetailRow>
            </dl>
            <h2 className="mb-1 mt-6 font-bold">Step times</h2>
            <dl>
              {AUDIT_STEPS.filter((step) => meta?.stepMs?.[step.key] !== undefined).map((step) => (
                <DetailRow key={step.key} label={step.key === 'analysis' && meta?.aiSource === 'mock' ? step.sampleLabel : step.label}>
                  {(meta.stepMs[step.key] / 1000).toFixed(1)} s
                </DetailRow>
              ))}
            </dl>
            {meta?.warnings?.length ? (
              <>
                <h2 className="mb-1 mt-6 font-bold">Warnings</h2>
                <ul className="list-disc pl-5 text-data">
                  {meta.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </TabsContent>
        </Tabs>
      ) : null}
    </>
  );
}
