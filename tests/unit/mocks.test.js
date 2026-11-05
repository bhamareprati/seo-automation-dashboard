import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const spec = fs.readFileSync(path.join(root, 'docs/00_ASSESSMENT_SPEC.md'), 'utf8');

function specBlockAfter(marker) {
  const at = spec.indexOf(marker);
  expect(at, `marker missing from the spec: ${marker}`).toBeGreaterThan(-1);
  return spec.slice(at).match(/```js\n([\s\S]*?)```/)[1];
}

const REQUIRED = {
  'index.js': '**Toggle Switch (mocks/index.js)**',
  'pagespeed.mock.js': '**pagespeed.mock.js**',
  'gsc.mock.js': '**gsc.mock.js**',
  'dataforseo.mock.js': '**dataforseo.mock.js**',
  'twilio.mock.js': '**twilio.mock.js**',
};

describe('required mocks', () => {
  it.each(Object.entries(REQUIRED))('required mocks are byte-identical to the spec: %s', (file, marker) => {
    const actual = fs.readFileSync(path.join(root, 'src/mocks', file), 'utf8');
    expect(actual).toBe(specBlockAfter(marker));
  });
});
