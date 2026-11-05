import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const srcDir = path.join(root, 'src');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const sourceFiles = () => walk(srcDir).filter((f) => /\.(js|jsx|mjs|cjs)$/.test(f));
const rel = (f) => path.relative(root, f).split(path.sep).join('/');

const IMPORT_PATTERN =
  /(?:require\(\s*['"]([^'"]+)['"]\s*\)|from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\))/gm;

function importsOf(source) {
  return [...source.matchAll(IMPORT_PATTERN)].map((m) => m[1] || m[2] || m[3] || m[4]);
}

/** Resolves an import to a project folder such as "pipeline", or a package name. */
function targetOf(fromFile, spec) {
  let resolved = null;
  if (spec.startsWith('@/')) resolved = spec.slice(2);
  else if (spec.startsWith('.')) {
    resolved = path.relative('src', path.posix.join(path.posix.dirname(fromFile), spec)).split(path.sep).join('/');
    if (resolved.startsWith('..')) return { kind: 'outside', name: resolved };
  }
  if (resolved !== null) return { kind: 'project', name: resolved.split('/')[0] };
  return { kind: 'package', name: spec };
}

const FRAMEWORK = /^(next($|\/)|react($|\/)|react-dom($|\/))/;
const CAPABILITIES = ['crawlers', 'analyzers', 'ai', 'reports', 'delivery'];

/** The table in docs/ARCHITECTURE.md section 4. Returns the rule a file falls under. */
function ruleFor(file) {
  const inFolder = (name) => file.startsWith(`src/${name}/`);
  if (file.startsWith('src/app/api/')) {
    return { forbidProject: ['crawlers', 'analyzers', 'ai', 'mocks'] };
  }
  if (file.startsWith('src/app/') || inFolder('components')) {
    return { forbidProject: ['pipeline', 'mocks', ...CAPABILITIES] };
  }
  if (inFolder('pipeline')) return { forbidProject: ['app', 'components'], forbidFramework: true };
  if (CAPABILITIES.some(inFolder)) return { forbidProject: ['pipeline', 'app', 'components'], forbidFramework: true };
  if (inFolder('lib')) {
    return { forbidProject: ['pipeline', 'app', 'components', 'mocks', ...CAPABILITIES], forbidFramework: true };
  }
  if (inFolder('mocks')) return { forbidAllProject: true, forbidFramework: true };
  return null;
}

function findViolations(file, source) {
  const rule = ruleFor(file);
  if (!rule) return [];
  const bad = [];
  for (const spec of importsOf(source)) {
    const target = targetOf(file, spec);
    if (target.kind === 'project') {
      const sibling = file.startsWith(`src/${target.name}/`);
      if (rule.forbidAllProject && !sibling) bad.push(spec);
      if (rule.forbidProject?.includes(target.name)) bad.push(spec);
    }
    if (target.kind === 'package' && rule.forbidFramework && FRAMEWORK.test(target.name)) bad.push(spec);
  }
  return bad;
}

describe('code rules', () => {
  it('no dangerouslySetInnerHTML in src', () => {
    const offenders = sourceFiles().filter((f) => fs.readFileSync(f, 'utf8').includes('dangerouslySetInnerHTML'));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no process.env outside env.js and mocks/index.js', () => {
    const allowed = new Set(['src/lib/env.js', 'src/mocks/index.js']);
    const offenders = sourceFiles()
      .map(rel)
      .filter((f) => !allowed.has(f))
      .filter((f) => fs.readFileSync(path.join(root, f), 'utf8').includes('process.env'));
    expect(offenders).toEqual([]);
  });

  it('no secret variable has a NEXT_PUBLIC prefix', () => {
    const files = [...sourceFiles(), path.join(root, '.env.example')];
    const offenders = files.filter((f) => fs.readFileSync(f, 'utf8').includes('NEXT_PUBLIC_'));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('layer import rules hold', () => {
    const problems = sourceFiles().flatMap((full) => {
      const file = rel(full);
      return findViolations(file, fs.readFileSync(full, 'utf8')).map((spec) => `${file} imports ${spec}`);
    });
    expect(problems).toEqual([]);
  });

  it('layer checker catches real violations', () => {
    expect(findViolations('src/pipeline/a.js', "const x = require('next/server');")).toHaveLength(1);
    expect(findViolations('src/pipeline/a.js', "const x = require('../app/page');")).toHaveLength(1);
    expect(findViolations('src/crawlers/a.js', "const x = require('../pipeline/runAudit');")).toHaveLength(1);
    expect(findViolations('src/app/admin/page.js', "import x from '@/pipeline/runAudit';")).toHaveLength(1);
    expect(findViolations('src/app/api/x/route.js', "import x from '@/mocks';")).toHaveLength(1);
    expect(findViolations('src/lib/a.js', "const x = require('../crawlers/site');")).toHaveLength(1);
    expect(findViolations('src/mocks/a.js', "const x = require('../lib/env');")).toHaveLength(1);
    expect(findViolations('src/crawlers/a.js', "const { getEnv } = require('../lib/env');")).toHaveLength(0);
    expect(findViolations('src/app/api/x/route.js', "import { prisma } from '@/lib/prisma';")).toHaveLength(0);
  });
});
