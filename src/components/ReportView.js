import { ReferenceStrip } from '@/components/ReferenceStrip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { message } from '@/lib/messages';
import { SCORE_ROWS, flagForScore, scoreStrip, vitalsFromSignals } from '@/lib/referenceRanges';
import { CATEGORY_LABEL, PRIORITY_LABEL, byPriority, firstFixes } from '@/lib/reportContent';

const dateText = (date) =>
  new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

function SectionHeading({ children }) {
  return <h2 className="mb-3 mt-10 border-b pb-2 text-section">{children}</h2>;
}

function Recommendation({ rec }) {
  return (
    <article className="break-inside-avoid border-b py-4 last:border-b-0">
      <p className="text-label text-muted-foreground">
        {PRIORITY_LABEL[rec.priority]}. {CATEGORY_LABEL[rec.category] || rec.category}
      </p>
      <p className="mt-1 font-bold">{rec.finding}</p>
      <p className="mt-1">Fix: {rec.fix}</p>
      <p className="mt-1 text-label font-normal text-muted-foreground">
        Effort: {rec.effort}. Likely impact: {rec.estimated_impact}.
      </p>
      <p className="mt-2 bg-slide px-3 py-2 text-data">
        <strong>How we&apos;ll know it worked:</strong> {rec.falsifiability_check}
      </p>
    </article>
  );
}

export function DataNotices({ meta }) {
  return (
    <div className="mt-4 space-y-2 text-data">
      {meta?.usedMocks ? (
        <p data-testid="sample-data-notice" className="border-l-4 border-methylene bg-slide px-3 py-2">
          {message('M-SAMPLE-DATA')}
        </p>
      ) : null}
      {meta?.aiFallbackReason === 'daily_cap' ? (
        <p className="border-l-4 border-watch bg-slide px-3 py-2">{message('M-AI-CAP')}</p>
      ) : null}
      <p data-testid="analysis-source" className="border-l-4 border-methylene bg-slide px-3 py-2">
        {meta?.aiSource === 'claude' ? message('M-AI-REAL', { model: meta.model }) : message('M-AI-SAMPLE')}
      </p>
    </div>
  );
}

/**
 * The full report as a client reads it. The admin's Report tab shows the same thing.
 * Everything from Claude or a website renders as React text, so it can't act as HTML.
 */
export function ReportView({ result, signals, createdAt, auditId, headline: Headline = 'h1', showDownload = true, canDownload = true }) {
  const score = result.overall_score;
  const strip = scoreStrip(score);
  const fixes = firstFixes(result.recommendations);
  const others = byPriority(result.recommendations).filter((r) => !fixes.includes(r));
  const vitals = vitalsFromSignals(signals?.cwv);
  const rows = signals?.gsc?.rows || [];
  const keyword = signals?.rankings?.tasks?.[0]?.result?.[0]?.keyword;
  const meta = signals?.meta;

  return (
    <div className="bg-sheet px-4 py-6 md:px-8 md:py-8">
      <Headline className="text-[1.5rem] font-bold leading-8 md:text-result">
        Your website scored {score} out of 100.
      </Headline>
      <div className="mt-4">
        <ReferenceStrip label="Overall score" strip={strip} animate />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-data text-muted-foreground">
          {flagForScore(score)}. Report from {dateText(createdAt)}.
        </p>
        {showDownload && canDownload ? (
          <a
            href={`/api/audit/${auditId}/report`}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-data font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto"
          >
            Download PDF
          </a>
        ) : null}
      </div>

      <DataNotices meta={meta} />

      <SectionHeading>Summary</SectionHeading>
      <p className="max-w-prose">{result.executive_summary}</p>

      {fixes.length ? (
        <>
          <SectionHeading>Fix these first</SectionHeading>
          {fixes.map((rec) => (
            <Recommendation key={`${rec.priority}-${rec.finding}`} rec={rec} />
          ))}
        </>
      ) : null}

      {result.quick_wins.length ? (
        <>
          <SectionHeading>Quick wins</SectionHeading>
          <ul className="max-w-prose list-disc space-y-1 pl-5">
            {result.quick_wins.map((win) => (
              <li key={win}>{win}</li>
            ))}
          </ul>
        </>
      ) : null}

      <SectionHeading>Test results</SectionHeading>
      <div className="space-y-5">
        {SCORE_ROWS.map(({ field, label }) => (
          <ReferenceStrip key={field} label={label} strip={scoreStrip(result.score_breakdown[field])} />
        ))}
        {vitals.map((vital) => (
          <ReferenceStrip key={vital.key} label={vital.label} strip={vital.strip} note={vital.goodText} />
        ))}
      </div>

      {rows.length || keyword ? (
        <>
          <SectionHeading>Keywords</SectionHeading>
          {rows.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Search term</TableHead>
                    <TableHead className="text-right">Position</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.query}>
                      <TableCell>{row.query}</TableCell>
                      <TableCell className="text-right">{row.position}</TableCell>
                      <TableCell className="text-right">{row.clicks}</TableCell>
                      <TableCell className="text-right">{Number(row.impressions).toLocaleString('en-IN')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
          {keyword ? (
            <p data-testid="keyword-rank" className="mt-3 text-data">
              &quot;{keyword}&quot; ranks {signals.rankings.client_rank_position}, with{' '}
              {Number(signals.rankings.keyword_search_volume).toLocaleString('en-IN')} searches a month.
            </p>
          ) : null}
        </>
      ) : null}

      {others.length ? (
        <>
          <SectionHeading>More recommendations</SectionHeading>
          {others.map((rec) => (
            <Recommendation key={`${rec.priority}-${rec.finding}`} rec={rec} />
          ))}
        </>
      ) : null}

      {result.important_issues.length ? (
        <>
          <SectionHeading>Other issues found</SectionHeading>
          <ul className="max-w-prose list-disc space-y-1 pl-5">
            {result.important_issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </>
      ) : null}

      <SectionHeading>How this report was made</SectionHeading>
      <p className="max-w-prose text-data">
        {meta?.crawlSource === 'fixture'
          ? 'The homepage content came from a sample page, because this demo site does not exist on the internet.'
          : `The homepage was read on ${dateText(createdAt)}.`}{' '}
        The crawler reads the HTML a server sends and does not run JavaScript, so a site built mainly with JavaScript
        may look thinner than it is. Structured data was checked with a rule-based test for common business types, not
        Google&apos;s Rich Results Test.
      </p>
    </div>
  );
}
