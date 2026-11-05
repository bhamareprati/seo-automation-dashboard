const os = require('node:os');
const path = require('node:path');
const { z } = require('zod');

/** An empty value in .env means "not set". */
const blankToUndefined = (value) => (value === '' ? undefined : value);

const optionalString = z.preprocess(blankToUndefined, z.string().optional());
const positiveInt = (fallback) =>
  z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(fallback));

/** Bcrypt hashes contain "$", which Next.js expands in .env, so they are stored base64-encoded. */
const base64BcryptHash = z.string().transform((value, ctx) => {
  const decoded = Buffer.from(value, 'base64').toString('utf8');
  if (!decoded.startsWith('$2')) {
    ctx.addIssue({ code: 'custom', message: 'must be a base64-encoded bcrypt hash' });
    return z.NEVER;
  }
  return decoded;
});

const schema = z
  .object({
    DATABASE_URL: z.string().min(1),
    DIRECT_URL: z.string().min(1),
    REDIS_URL: z.string().regex(/^rediss?:\/\//, 'must be a redis:// or rediss:// URL'),
    USE_MOCKS: z.enum(['true', 'false']),
    ANTHROPIC_API_KEY: optionalString,
    ANTHROPIC_MODEL: z.preprocess(blankToUndefined, z.string().default('claude-sonnet-4-6')),
    MAX_REAL_AI_AUDITS_PER_DAY: positiveInt(20),
    CRON_SECRET: z.string().min(32, 'must be at least 32 characters'),
    SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),
    ADMIN_EMAIL: z.email(),
    ADMIN_PASSWORD_HASH: base64BcryptHash,
    CLIENT_PASSWORD_HASH: base64BcryptHash,
    APP_URL: z.url(),
    REPORTS_DIR: z.preprocess(blankToUndefined, z.string().default(path.join(os.tmpdir(), 'reports'))),
    CHROME_EXECUTABLE_PATH: optionalString,
    AUDIT_INTERVAL_DAYS: positiveInt(30),
    CRAWL_TOTAL_BUDGET_MS: positiveInt(30000),
    CRAWL_REQUEST_TIMEOUT_MS: positiveInt(10000),
    MOCK_STEP_DELAY_MS: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).default(800)),
  })
  .superRefine((env, ctx) => {
    if (env.USE_MOCKS === 'false' && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['ANTHROPIC_API_KEY'],
        message: 'is required when USE_MOCKS is false',
      });
    }
  });

/**
 * Validates configuration. The error names each bad variable but never prints a value.
 * @param {Record<string, string | undefined>} source
 */
function parseEnv(source) {
  const result = schema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid configuration:\n  ${problems.join('\n  ')}`);
  }
  return { ...result.data, useMocks: result.data.USE_MOCKS === 'true' };
}

let cached;

/** Reads configuration on first use, so `next build` does not need it. */
function getEnv() {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}

module.exports = { parseEnv, getEnv };
