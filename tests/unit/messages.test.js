import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { MESSAGES, message } = require('../../src/lib/messages.js');

const doc = fs.readFileSync(path.resolve(__dirname, '../../docs/UI_UX_DESIGN.md'), 'utf8');
const catalogue = Object.fromEntries(
  [...doc.matchAll(/^\| `(M-[A-Z-]+)` \| (.+?) \| [^|]+ \|$/gm)].map((m) => [m[1], m[2]]),
);

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
