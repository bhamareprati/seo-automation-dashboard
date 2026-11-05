import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');

// tests/fixtures/spec holds exact copies of the spec's code blocks, so the confidential document stays out of the repo.
const REQUIRED = ['index.js', 'pagespeed.mock.js', 'gsc.mock.js', 'dataforseo.mock.js', 'twilio.mock.js'];

describe('required mocks', () => {
  it.each(REQUIRED)('required mocks are byte-identical to the spec: %s', (file) => {
    const actual = fs.readFileSync(path.join(root, 'src/mocks', file), 'utf8');
    const expected = fs.readFileSync(path.join(root, 'tests/fixtures/spec', `${file}.txt`), 'utf8');
    expect(actual).toBe(expected);
  });
});
