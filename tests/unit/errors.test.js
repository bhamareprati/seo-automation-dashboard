import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { NotFoundError, QueueUnavailableError, toErrorResponse } = require('../../src/lib/errors.js');

describe('error responses', () => {
  afterEach(() => vi.restoreAllMocks());

  it('known errors keep their status and message', () => {
    expect(toErrorResponse(new NotFoundError('Client not found'))).toEqual({
      status: 404,
      body: { error: 'Client not found', code: 'NOT_FOUND' },
    });
    expect(toErrorResponse(new QueueUnavailableError('Queue down')).status).toBe(503);
  });

  it('unknown errors hide their details from the response and the log', () => {
    const secret = 'postgresql://user:secret-password@host/db';
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = Object.assign(new Error(`Cannot reach ${secret}`), { name: 'PrismaClientInitializationError', errorCode: 'P1001' });

    const response = toErrorResponse(err);

    expect(response).toEqual({ status: 500, body: { error: 'Something went wrong.', code: 'INTERNAL' } });
    const logged = stdout.mock.calls.map((call) => String(call[0])).join('');
    expect(logged).toContain('P1001');
    expect(logged).not.toContain('secret-password');
  });
});
