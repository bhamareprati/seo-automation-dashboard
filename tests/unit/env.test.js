import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { parseEnv } = require('../../src/lib/env.js');

const hash = Buffer.from('$2a$10$abcdefghijklmnopqrstuv').toString('base64');
const valid = {
  DATABASE_URL: 'postgresql://user:pass@host/db',
  DIRECT_URL: 'postgresql://user:pass@host/db',
  REDIS_URL: 'rediss://default:token@host:6379',
  USE_MOCKS: 'true',
  CRON_SECRET: 'c'.repeat(32),
  SESSION_SECRET: 's'.repeat(32),
  ADMIN_EMAIL: 'admin@demo.test',
  ADMIN_PASSWORD_HASH: hash,
  CLIENT_PASSWORD_HASH: hash,
  APP_URL: 'http://localhost:3000',
};

describe('configuration', () => {
  it('accepts a complete configuration and applies defaults', () => {
    const env = parseEnv(valid);
    expect(env.useMocks).toBe(true);
    expect(env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6');
    expect(env.MAX_REAL_AI_AUDITS_PER_DAY).toBe(20);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('missing required variable fails at startup', () => {
    const { DATABASE_URL, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('USE_MOCKS false without an API key fails at startup', () => {
    expect(() => parseEnv({ ...valid, USE_MOCKS: 'false' })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => parseEnv({ ...valid, USE_MOCKS: 'false', ANTHROPIC_API_KEY: '' })).toThrow(/ANTHROPIC_API_KEY/);
    expect(parseEnv({ ...valid, USE_MOCKS: 'false', ANTHROPIC_API_KEY: 'k' }).useMocks).toBe(false);
  });

  it('decodes base64 password hashes and rejects raw values', () => {
    expect(parseEnv(valid).ADMIN_PASSWORD_HASH.startsWith('$2a$')).toBe(true);
    expect(() => parseEnv({ ...valid, ADMIN_PASSWORD_HASH: 'not-a-hash' })).toThrow(/ADMIN_PASSWORD_HASH/);
  });

  it('never prints a value in the error message', () => {
    const secretValue = 'short-secret-value';
    let message = '';
    try {
      parseEnv({ ...valid, CRON_SECRET: secretValue });
    } catch (err) {
      message = err.message;
    }
    expect(message).toContain('CRON_SECRET');
    expect(message).not.toContain(secretValue);
  });
});
