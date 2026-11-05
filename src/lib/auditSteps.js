/**
 * The pipeline's steps, in the order fixed by the spec (section 3.2), with their labels and progress.
 * Plain data, so the browser can use it too. Table: docs/TRD.md section 9.1.
 */
const WAITING_LABEL = 'Waiting to start';

const AUDIT_STEPS = [
  { key: 'crawl', label: 'Crawling website', progress: 15 },
  { key: 'pagespeed', label: 'Fetching PageSpeed data', progress: 25 },
  { key: 'gsc', label: 'Fetching Search Console data', progress: 32 },
  { key: 'schema', label: 'Validating Schema.org markup', progress: 40 },
  { key: 'onPage', label: 'Analysing on-page SEO', progress: 48 },
  { key: 'robots', label: 'Checking robots.txt and sitemap', progress: 55 },
  { key: 'rankings', label: 'Fetching keyword rankings', progress: 62 },
  { key: 'analysis', label: 'Analysing with Claude', sampleLabel: 'Preparing sample analysis', progress: 85 },
  { key: 'save', label: 'Saving audit results', progress: 90 },
  { key: 'pdf', label: 'Generating PDF report', progress: 96 },
  { key: 'delivery', label: 'Sending notifications', progress: 100 },
];

const ACTIVE_STATUSES = ['QUEUED', 'RUNNING'];

/** Labels and colours from docs/UI_UX_DESIGN.md section 8. */
const STATUS_DISPLAY = {
  QUEUED: { label: 'Waiting', className: 'text-muted-foreground' },
  RUNNING: { label: 'Running', className: 'text-methylene' },
  COMPLETED: { label: 'Complete', className: 'text-good' },
  FAILED: { label: 'Failed', className: 'text-poor' },
};

/**
 * The name to show for a step. Never says "Analysing with Claude" for a sample analysis.
 * @param {{ label: string, sampleLabel?: string }} step
 * @param {{ aiSource?: string | null, usesSampleAnalysis?: boolean }} state aiSource is known once an audit has saved its result
 */
function stepDisplayLabel(step, { aiSource, usesSampleAnalysis }) {
  if (!step.sampleLabel) return step.label;
  const sample = aiSource ? aiSource === 'mock' : Boolean(usesSampleAnalysis);
  return sample ? step.sampleLabel : step.label;
}

module.exports = { WAITING_LABEL, AUDIT_STEPS, ACTIVE_STATUSES, STATUS_DISPLAY, stepDisplayLabel };
