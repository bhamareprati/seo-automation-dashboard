import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { isNotConnectedError, withDbRetry } = require('../../src/lib/dbRetry.js');

const sleep = vi.fn(async () => {});
const initError = () => Object.assign(new Error('Timed out fetching a new connection'), { name: 'PrismaClientInitializationError' });

describe('withDbRetry', () => {
  it('retries when no connection could be made', async () => {
    const work = vi.fn().mockRejectedValueOnce(initError()).mockResolvedValue('ok');
    await expect(withDbRetry(work, { sleep })).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('gives up after two retries', async () => {
    const work = vi.fn().mockRejectedValue(initError());
    await expect(withDbRetry(work, { sleep })).rejects.toMatchObject({ name: 'PrismaClientInitializationError' });
    expect(work).toHaveBeenCalledTimes(3);
  });

  it('never retries an error from a query that may have run', async () => {
    const unique = Object.assign(new Error('duplicate'), { code: 'P2002' });
    const lost = Object.assign(new Error('closed'), { code: 'P1017' });
    for (const err of [unique, lost, new Error('other')]) {
      const work = vi.fn().mockRejectedValue(err);
      await expect(withDbRetry(work, { sleep })).rejects.toBe(err);
      expect(work).toHaveBeenCalledOnce();
    }
  });

  it('recognises connection failures by name and code', () => {
    expect(isNotConnectedError(initError())).toBe(true);
    expect(isNotConnectedError({ code: 'P1001' })).toBe(true);
    expect(isNotConnectedError({ errorCode: 'P2024' })).toBe(true);
    expect(isNotConnectedError({ code: 'P2025' })).toBe(false);
  });
});
