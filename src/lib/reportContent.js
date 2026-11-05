/** Plain-language names for values in Claude's JSON. Shared by the portals and the PDF. */
const PRIORITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const PRIORITY_LABEL = { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
const CATEGORY_LABEL = {
  Technical: 'Technical',
  OnPage: 'On-page',
  Content: 'Content',
  Schema: 'Structured data',
  CWV: 'Page speed',
};

/** Critical and high recommendations first, in the report's "Fix these first" section. */
const firstFixes = (recommendations) => recommendations.filter((r) => r.priority === 'CRITICAL' || r.priority === 'HIGH');

const byPriority = (recommendations) =>
  PRIORITY_ORDER.flatMap((priority) => recommendations.filter((r) => r.priority === priority));

module.exports = { PRIORITY_ORDER, PRIORITY_LABEL, CATEGORY_LABEL, firstFixes, byPriority };
