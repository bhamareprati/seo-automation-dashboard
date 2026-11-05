/**
 * Reference ranges for scores and Core Web Vitals. Used by the portals and the PDF.
 * Plain data and functions, so the browser can use them too.
 */
const FLAGS = { GOOD: 'Good', WATCH: 'Needs work', POOR: 'Poor' };

const VITALS = {
  lcp: {
    audit: 'largest-contentful-paint',
    label: 'Page load time (LCP)',
    unit: 's',
    good: 2.5,
    poor: 4,
    max: 8,
    goodText: 'Good is 2.5 s or less',
  },
  inp: {
    audit: 'interaction-to-next-paint',
    label: 'Responsiveness (INP)',
    unit: 'ms',
    good: 200,
    poor: 500,
    max: 1000,
    goodText: 'Good is 200 ms or less',
  },
  cls: {
    audit: 'cumulative-layout-shift',
    label: 'Layout stability (CLS)',
    unit: '',
    good: 0.1,
    poor: 0.25,
    max: 0.5,
    goodText: 'Good is 0.1 or less',
  },
};

/** The flag for a 0 to 100 score, using Lighthouse's bands. */
function flagForScore(score) {
  if (score >= 90) return FLAGS.GOOD;
  if (score >= 50) return FLAGS.WATCH;
  return FLAGS.POOR;
}

/** The flag for a Core Web Vital, where lower is better. */
function flagForVital(key, value) {
  const vital = VITALS[key];
  if (value <= vital.good) return FLAGS.GOOD;
  if (value <= vital.poor) return FLAGS.WATCH;
  return FLAGS.POOR;
}

/** Reads the number out of a value like "4.2 s", "280 ms" or "0.08". */
function parseDisplayValue(text) {
  const number = Number.parseFloat(String(text).replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
}

const clampPercent = (value) => Math.min(100, Math.max(0, value));

/** A score's strip: higher is better, so Poor sits on the left. */
function scoreStrip(score) {
  return {
    value: `${score}`,
    flag: flagForScore(score),
    markerPercent: clampPercent(score),
    segments: [
      { flag: FLAGS.POOR, percent: 50 },
      { flag: FLAGS.WATCH, percent: 40 },
      { flag: FLAGS.GOOD, percent: 10 },
    ],
  };
}

/** A vital's strip: lower is better, so Good sits on the left. */
function vitalStrip(key, value) {
  const vital = VITALS[key];
  const goodPercent = (vital.good / vital.max) * 100;
  const watchPercent = ((vital.poor - vital.good) / vital.max) * 100;
  return {
    value: `${value}${vital.unit ? ` ${vital.unit}` : ''}`,
    flag: flagForVital(key, value),
    markerPercent: clampPercent((value / vital.max) * 100),
    segments: [
      { flag: FLAGS.GOOD, percent: goodPercent },
      { flag: FLAGS.WATCH, percent: watchPercent },
      { flag: FLAGS.POOR, percent: 100 - goodPercent - watchPercent },
    ],
  };
}

/**
 * The vitals a report can show, from the PageSpeed section of the signals. Anything missing is left out.
 * @param {object} cwv signals.cwv
 */
function vitalsFromSignals(cwv) {
  return Object.entries(VITALS).flatMap(([key, vital]) => {
    const value = parseDisplayValue(cwv?.audits?.[vital.audit]?.displayValue);
    if (value === null) return [];
    return [{ key, label: vital.label, goodText: vital.goodText, strip: vitalStrip(key, value) }];
  });
}

/** The score rows of a report, from Claude's breakdown. */
const SCORE_ROWS = [
  { field: 'technical', label: 'Technical' },
  { field: 'on_page', label: 'On-page' },
  { field: 'content', label: 'Content' },
  { field: 'core_web_vitals', label: 'Page speed' },
  { field: 'schema', label: 'Structured data' },
];

module.exports = {
  FLAGS,
  VITALS,
  SCORE_ROWS,
  flagForScore,
  flagForVital,
  parseDisplayValue,
  scoreStrip,
  vitalStrip,
  vitalsFromSignals,
};
