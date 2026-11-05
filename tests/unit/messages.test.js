import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { MESSAGES, message } = require('../../src/lib/messages.js');

const catalogue = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/message-catalogue.json'), 'utf8'));

describe('messages', () => {
  it('message text matches the catalogue exactly', () => {
    expect(Object.keys(catalogue).length).toBeGreaterThan(20);
    expect(MESSAGES).toEqual(catalogue);
  });

  it('fills placeholders and rejects unknown IDs', () => {
    expect(message('M-AUDIT-DONE', { client: 'A', score: 58 })).toBe('Audit finished for A: 58 out of 100.');
    expect(() => message('M-NOPE')).toThrow();
  });
});
