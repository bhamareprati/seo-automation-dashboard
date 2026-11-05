const { z } = require('zod');

const Score = z.number().int().min(0).max(100);

const Recommendation = z.object({
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  category: z.enum(['Technical', 'OnPage', 'Content', 'Schema', 'CWV']),
  finding: z.string(),
  fix: z.string(),
  estimated_impact: z.enum(['High', 'Medium', 'Low']),
  effort: z.enum(['Hours', 'Days', 'Weeks']),
  falsifiability_check: z.string(),
});

/** The JSON structure in the spec's prompt. Its issue lists have no stated item type, so they are short strings. */
const AuditResult = z.object({
  audit_version: z.literal('v1.0'),
  overall_score: Score,
  score_breakdown: z.object({
    technical: Score,
    on_page: Score,
    content: Score,
    core_web_vitals: Score,
    schema: Score,
  }),
  critical_issues: z.array(z.string()),
  important_issues: z.array(z.string()),
  quick_wins: z.array(z.string()),
  recommendations: z.array(Recommendation),
  executive_summary: z.string(),
});

// The prompt's maximums. The API's schema can't enforce array lengths, so code does.
const LIST_LIMITS = { critical_issues: 5, important_issues: 8, quick_wins: 5 };

/**
 * Trims lists that are over the prompt's limits and says so, rather than failing a paid response.
 * @returns {{ result: object, warnings: string[] }}
 */
function applyListLimits(result) {
  const trimmed = { ...result };
  const warnings = [];
  for (const [field, limit] of Object.entries(LIST_LIMITS)) {
    if (trimmed[field].length > limit) {
      warnings.push(`${field} had ${trimmed[field].length} items, kept the first ${limit}.`);
      trimmed[field] = trimmed[field].slice(0, limit);
    }
  }
  return { result: trimmed, warnings };
}

module.exports = { AuditResult, LIST_LIMITS, applyListLimits };
