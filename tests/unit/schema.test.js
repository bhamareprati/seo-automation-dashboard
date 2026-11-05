import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const specSchema = fs.readFileSync(path.join(root, 'tests/fixtures/spec/schema.prisma.txt'), 'utf8');
const actualSchema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');

/** Maps each model, enum, generator and datasource to its normalised lines, ignoring comments and spacing. */
function parseBlocks(schema) {
  const blocks = {};
  let current = null;
  for (const raw of schema.split('\n')) {
    const line = raw.replace(/\/\/.*$/, '').trim().replace(/\s+/g, ' ');
    if (!line) continue;
    const open = line.match(/^(model|enum|generator|datasource) (\w+) \{$/);
    if (open) {
      current = `${open[1]} ${open[2]}`;
      blocks[current] = [];
    } else if (line === '}') {
      current = null;
    } else if (current) {
      blocks[current].push(line);
    }
  }
  return blocks;
}

describe('database schema', () => {
  it('spec tables and columns are present and unchanged', () => {
    const expected = parseBlocks(specSchema);
    const actual = parseBlocks(actualSchema);
    expect(Object.keys(expected)).toHaveLength(6);
    for (const [name, lines] of Object.entries(expected)) {
      expect(actual[name], `${name} is missing`).toBeDefined();
      for (const line of lines) expect(actual[name], `${name}: ${line}`).toContain(line);
    }
  });

  it('only documented additions exist beyond the spec', () => {
    const expected = parseBlocks(specSchema);
    const actual = parseBlocks(actualSchema);
    const extraBlocks = Object.keys(actual).filter((name) => !expected[name]);
    expect(extraBlocks).toEqual(['model AuditReport']);
    const extraLines = Object.entries(expected).flatMap(([name, lines]) =>
      actual[name].filter((line) => !lines.includes(line)).map((line) => `${name}: ${line}`),
    );
    expect(extraLines).toEqual(['model Audit: report AuditReport?']);
  });
});
