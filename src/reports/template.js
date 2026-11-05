const { message } = require('../lib/messages');
const { FLAGS, SCORE_ROWS, flagForScore, scoreStrip, vitalsFromSignals } = require('../lib/referenceRanges');
const { CATEGORY_LABEL, PRIORITY_LABEL, byPriority, firstFixes } = require('../lib/reportContent');

/**
 * Every value that came from a website or from Claude goes through this.
 * It turns text into plain text, so nothing in it can act as HTML.
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const e = escapeHtml;

const FLAG_CLASS = { [FLAGS.GOOD]: 'good', [FLAGS.WATCH]: 'watch', [FLAGS.POOR]: 'poor' };

const STYLES = `
  @page { size: A4; margin: 18mm 16mm 18mm; }
  * { box-sizing: border-box; }
  html { font-variant-numeric: tabular-nums; }
  body { margin: 0; color: #1B2A33; background: #fff; font: 10.5pt/1.55 "Public Sans", "Open Sans", Arial, Helvetica, sans-serif; }
  h1 { font-size: 20pt; line-height: 1.25; margin: 0; }
  h2 { font-size: 14pt; line-height: 1.3; margin: 22pt 0 8pt; padding-bottom: 4pt; border-bottom: 1px solid #D3DCE0; break-after: avoid; }
  h3 { font-size: 11pt; margin: 0; }
  p { margin: 0 0 6pt; }
  ul { margin: 0; padding-left: 14pt; }
  li { margin-bottom: 3pt; }
  .muted { color: #55656E; }
  .small { font-size: 9pt; }
  .product { font-size: 9.5pt; color: #55656E; margin-bottom: 18pt; }
  .result { font-size: 18pt; line-height: 1.3; font-weight: 700; margin: 18pt 0 8pt; }
  .notice { margin: 12pt 0 0; padding: 7pt 9pt; background: #F4F7F8; border-left: 3px solid #17507F; font-size: 9.5pt; }
  .strip-row { margin: 0 0 11pt; break-inside: avoid; }
  .strip-head { display: flex; justify-content: space-between; gap: 10pt; margin-bottom: 3pt; }
  .strip-value { white-space: nowrap; font-weight: 700; }
  .strip { position: relative; display: flex; height: 8pt; margin-top: 8pt; }
  .segment { height: 100%; }
  .segment.good { background: #CFE8DC; }
  .segment.watch { background: #F5E6C4; }
  .segment.poor { background: #F3D5D2; }
  .marker { position: absolute; top: -4pt; bottom: -2pt; width: 2px; margin-left: -1px; background: #1B2A33; }
  .flag.good { color: #1E7F5C; }
  .flag.watch { color: #8F6200; }
  .flag.poor { color: #B3261E; }
  .rec { padding: 8pt 0; border-bottom: 1px solid #D3DCE0; break-inside: avoid; }
  .rec:last-child { border-bottom: 0; }
  .rec-priority { font-size: 9pt; font-weight: 700; }
  .rec-check { margin-top: 4pt; padding: 5pt 8pt; background: #F4F7F8; }
  .rec-meta { font-size: 9pt; color: #55656E; margin-top: 3pt; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th, td { text-align: left; padding: 4pt 6pt 4pt 0; border-bottom: 1px solid #D3DCE0; vertical-align: top; }
  th.num, td.num { text-align: right; padding-right: 0; }
  tr { break-inside: avoid; }
  .page-break { break-before: page; }
`;

function stripRow({ label, strip, note }) {
  const flagClass = FLAG_CLASS[strip.flag];
  return `
    <div class="strip-row">
      <div class="strip-head">
        <span>${e(label)}</span>
        <span class="strip-value">${e(strip.value)} <span class="flag ${flagClass}">${e(strip.flag)}</span></span>
      </div>
      <div class="strip">
        ${strip.segments.map((s) => `<div class="segment ${FLAG_CLASS[s.flag]}" style="width:${s.percent}%"></div>`).join('')}
        <div class="marker" style="left:${strip.markerPercent}%"></div>
      </div>
      ${note ? `<p class="small muted" style="margin:3pt 0 0">${e(note)}</p>` : ''}
    </div>`;
}

function recommendationBlock(rec) {
  return `
    <div class="rec">
      <p class="rec-priority">${e(PRIORITY_LABEL[rec.priority])}. ${e(CATEGORY_LABEL[rec.category] || rec.category)}</p>
      <p><strong>${e(rec.finding)}</strong></p>
      <p>Fix: ${e(rec.fix)}</p>
      <p class="rec-meta">Effort: ${e(rec.effort)}. Likely impact: ${e(rec.estimated_impact)}.</p>
      <div class="rec-check"><strong>How we'll know it worked:</strong> ${e(rec.falsifiability_check)}</div>
    </div>`;
}

function keywordSection(signals) {
  const rows = signals.gsc?.rows || [];
  const rankings = signals.rankings;
  const keyword = rankings?.tasks?.[0]?.result?.[0]?.keyword;
  if (!rows.length && !keyword) return '';
  return `
    <h2>Keywords</h2>
    ${rows.length ? `
    <table>
      <thead><tr><th>Search term</th><th class="num">Position</th><th class="num">Clicks</th><th class="num">Impressions</th></tr></thead>
      <tbody>
        ${rows.map((r) => `<tr><td>${e(r.query)}</td><td class="num">${e(r.position)}</td><td class="num">${e(r.clicks)}</td><td class="num">${e(Number(r.impressions).toLocaleString('en-IN'))}</td></tr>`).join('')}
      </tbody>
    </table>` : ''}
    ${keyword ? `<p style="margin-top:8pt">"${e(keyword)}" ranks ${e(rankings.client_rank_position)}, with ${e(Number(rankings.keyword_search_volume).toLocaleString('en-IN'))} searches a month.</p>` : ''}`;
}

function methodSection(signals, dateText) {
  const meta = signals.meta || {};
  const crawled = meta.crawlSource === 'fixture'
    ? 'The homepage content came from a sample page, because this demo site does not exist on the internet.'
    : `The homepage was read on ${e(dateText)}.`;
  return `
    <h2>How this report was made</h2>
    <p>${crawled} The crawler reads the HTML a server sends and does not run JavaScript, so a site built mainly with JavaScript may look thinner than it is.</p>
    <p>Structured data was checked with a rule-based test for common business types. It is not Google's Rich Results Test.</p>
    ${meta.usedMocks ? `<p>${e(message('M-SAMPLE-DATA'))}</p>` : ''}
    <p>${e(analysisLine(meta))}</p>`;
}

function analysisLine(meta) {
  if (meta.aiSource === 'claude') return message('M-AI-REAL', { model: meta.model });
  return message('M-AI-SAMPLE');
}

/**
 * Builds the report as one self-contained HTML string, with all CSS inline and no external requests.
 * @param {{ client: { name: string, websiteUrl: string }, result: object, signals: object, createdAt: Date }} input
 */
function renderReportHtml({ client, result, signals, createdAt }) {
  const dateText = new Date(createdAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  const score = result.overall_score;
  const fixes = firstFixes(result.recommendations);
  const vitals = vitalsFromSignals(signals.cwv);
  const meta = signals.meta || {};

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${e(client.name)} SEO report</title>
<style>${STYLES}</style>
</head>
<body>
  <p class="product">SEO Automation Dashboard</p>
  <h1>${e(client.name)}</h1>
  <p class="muted">${e(client.websiteUrl)}. Report from ${e(dateText)}.</p>

  <p class="result">Your website scored ${e(score)} out of 100.</p>
  ${stripRow({ label: 'Overall score', strip: scoreStrip(score) })}
  <p class="muted small">${e(flagForScore(score))}. Good is 90 or above.</p>

  ${meta.usedMocks ? `<p class="notice">${e(message('M-SAMPLE-DATA'))}</p>` : ''}
  <p class="notice">${e(analysisLine(meta))}</p>

  <h2>Summary</h2>
  <p>${e(result.executive_summary)}</p>

  ${result.critical_issues.length ? `<h2>Critical issues</h2><ul>${result.critical_issues.map((i) => `<li>${e(i)}</li>`).join('')}</ul>` : ''}

  <div class="page-break"></div>
  ${fixes.length ? `<h2>Fix these first</h2>${fixes.map(recommendationBlock).join('')}` : ''}
  ${result.quick_wins.length ? `<h2>Quick wins</h2><ul>${result.quick_wins.map((i) => `<li>${e(i)}</li>`).join('')}</ul>` : ''}

  <div class="page-break"></div>
  <h2>Test results</h2>
  ${SCORE_ROWS.map(({ field, label }) => stripRow({ label, strip: scoreStrip(result.score_breakdown[field]) })).join('')}
  ${vitals.map((v) => stripRow({ label: v.label, strip: v.strip, note: v.goodText })).join('')}
  ${keywordSection(signals)}

  <div class="page-break"></div>
  <h2>All recommendations</h2>
  ${byPriority(result.recommendations).map(recommendationBlock).join('')}
  ${result.important_issues.length ? `<h2>Other issues found</h2><ul>${result.important_issues.map((i) => `<li>${e(i)}</li>`).join('')}</ul>` : ''}
  ${methodSection(signals, dateText)}
</body>
</html>`;
}

/** The page footer, which Chromium renders separately. It also needs escaping. */
function footerTemplate(clientName) {
  return `<div style="width:100%;font-size:8pt;color:#55656E;padding:0 16mm;display:flex;justify-content:space-between;font-family:Arial,Helvetica,sans-serif;"><span>${e(clientName)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
}

module.exports = { renderReportHtml, footerTemplate, escapeHtml };
